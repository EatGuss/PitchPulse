/**
 * ranked-handler — AppSync Lambda data source for Ranked mode + Titles:
 *   findRankedMatch, equipTitle, completeRankedMatch
 *
 * pp-users PROFILE extensions (Gate B):
 *   weeklyPoints, weeklyPointsResetAt, seasonalPoints, seasonNumber, seasonStartedAt
 *
 * Ranked match completion increments weekly/seasonal totals and writes pp-leaderboards.
 * Watch Room never calls this mutation.
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { AppSyncResolverEvent } from 'aws-lambda';
import {
  appsyncMutation,
  NOTIFY_TIER_PROMOTED,
  NOTIFY_TITLE_UNLOCKED,
  PUBLISH_LEADERBOARD_UPDATED,
} from '../shared/appsyncPublish';
import {
  evaluateTitleUnlocks,
  lifetimeAccuracyRatio,
  type RankedMatchEndContext,
  type TitleStats,
} from '../shared/titleRules';
import {
  getIsoWeekKey,
  nextMondayMidnightBerlinIso,
  seasonalLeaderboardPk,
  weeklyLeaderboardPk,
} from '../shared/periods';

const REGION = process.env.AWS_REGION ?? 'eu-central-1';
const USERS_TABLE = required('USERS_TABLE');
const LEADERBOARDS_TABLE = required('LEADERBOARDS_TABLE');

const DEMO_OPPONENT: Record<string, string> = {
  alice: 'bob',
  bob: 'alice',
};

const DEMO_MATCHDAY_ID = '30';

const DEMO_NAMES: Record<string, string> = {
  alice: 'Alice',
  bob: 'Bob',
};

const TITLE_NAMES: Record<string, string> = {
  sharpshooter: 'Sharpshooter',
  sniper: 'Sniper',
  oracle: 'Oracle',
  analyst: 'Analyst',
  veteran: 'Veteran',
  'hot-take-hero': 'Hot Take Hero',
  'comeback-king': 'Comeback King',
  'perfect-match': 'Perfect Match',
};

type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND' | 'CHAMPION';

const TIER_ORDER: Tier[] = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'CHAMPION'];

const WINS_TO_ADVANCE: Record<Tier, number | null> = {
  BRONZE: 5,
  SILVER: 5,
  GOLD: 8,
  DIAMOND: 10,
  CHAMPION: null,
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const ddb = new DynamoDBClient({ region: REGION });

interface UserProfile {
  tier?: Tier;
  tierWinsTowardNext?: number;
  totalShots?: number;
  correctShots?: number;
  rankedMatchesPlayed?: number;
  equippedTitleId?: string;
  unlockedTitles?: string[];
  weeklyPoints?: number;
  weeklyPointsResetAt?: string;
  seasonalPoints?: number;
  seasonNumber?: number;
  seasonStartedAt?: string;
}

interface RankedMatchdayRecord {
  matchdayId: string;
  lockedFixtureId?: string;
  lockedFixtureLabel?: string;
  played?: boolean;
  matchPoints?: number;
  lockedAt?: number;
}

export const handler = async (event: AppSyncResolverEvent<Record<string, unknown>>) => {
  switch (event.info.fieldName) {
    case 'findRankedMatch':
      return findRankedMatch(event.arguments.userId as string);
    case 'rankedMatchdayStatus':
      return rankedMatchdayStatus(
        event.arguments.userId as string,
        (event.arguments.matchdayId as string) ?? DEMO_MATCHDAY_ID,
      );
    case 'lockInRankedMatch': {
      const input = event.arguments.input as {
        userId: string;
        matchdayId: string;
        fixtureId: string;
        fixtureLabel: string;
      };
      return lockInRankedMatch(input.userId, input.matchdayId, input.fixtureId, input.fixtureLabel);
    }
    case 'equipTitle':
      return equipTitle(event.arguments.userId as string, event.arguments.titleId as string);
    case 'unlockHotTakeHero':
      return unlockHotTakeHero(event.arguments.userId as string);
    case 'completeRankedMatch':
      return completeRankedMatch(
        event.arguments.matchId as string,
        event.arguments.winnerId as string,
        event.arguments.loserId as string,
        event.arguments.winnerMatchPoints as number,
        event.arguments.loserMatchPoints as number,
        {
          winnerShotsInMatch: event.arguments.winnerShotsInMatch as number | undefined,
          winnerCorrectInMatch: event.arguments.winnerCorrectInMatch as number | undefined,
          loserShotsInMatch: event.arguments.loserShotsInMatch as number | undefined,
          loserCorrectInMatch: event.arguments.loserCorrectInMatch as number | undefined,
          winnerPointsAtHalfTime: event.arguments.winnerPointsAtHalfTime as number | undefined,
          loserPointsAtHalfTime: event.arguments.loserPointsAtHalfTime as number | undefined,
        },
      );
    default:
      throw new Error(`Unsupported field: ${event.info.fieldName}`);
  }
};

async function ensureProfile(userId: string): Promise<void> {
  const now = Date.now();
  await ddb.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: marshall({ PK: `USER#${userId}`, SK: 'PROFILE' }),
      UpdateExpression: `
        SET tier = if_not_exists(tier, :bronze),
            tierWinsTowardNext = if_not_exists(tierWinsTowardNext, :zero),
            rankedMatchesPlayed = if_not_exists(rankedMatchesPlayed, :zero),
            weeklyPoints = if_not_exists(weeklyPoints, :zero),
            seasonalPoints = if_not_exists(seasonalPoints, :zero),
            seasonNumber = if_not_exists(seasonNumber, :one),
            weeklyPointsResetAt = if_not_exists(weeklyPointsResetAt, :nextReset),
            seasonStartedAt = if_not_exists(seasonStartedAt, :seasonStart),
            updatedAt = :ts
      `,
      ExpressionAttributeValues: marshall({
        ':bronze': 'BRONZE',
        ':zero': 0,
        ':one': 1,
        ':nextReset': nextMondayMidnightBerlinIso(),
        ':seasonStart': new Date().toISOString(),
        ':ts': now,
      }),
    }),
  );
}

async function loadProfile(userId: string): Promise<UserProfile> {
  const res = await ddb.send(
    new GetItemCommand({
      TableName: USERS_TABLE,
      Key: marshall({ PK: `USER#${userId}`, SK: 'PROFILE' }),
    }),
  );
  if (!res.Item) {
    return {
      tier: 'BRONZE',
      tierWinsTowardNext: 0,
      totalShots: 0,
      correctShots: 0,
      rankedMatchesPlayed: 0,
      unlockedTitles: [],
      weeklyPoints: 0,
      seasonalPoints: 0,
      seasonNumber: 1,
    };
  }
  return unmarshall(res.Item) as UserProfile;
}

function equippedTitleName(profile: UserProfile): string | undefined {
  const id = profile.equippedTitleId;
  return id ? (TITLE_NAMES[id] ?? id) : undefined;
}

function matchdayItemKey(userId: string, matchdayId: string) {
  return marshall({ PK: `USER#${userId}`, SK: `RANKED_MATCHDAY#${matchdayId}` });
}

async function loadRankedMatchday(userId: string, matchdayId: string): Promise<RankedMatchdayRecord | null> {
  const res = await ddb.send(
    new GetItemCommand({
      TableName: USERS_TABLE,
      Key: matchdayItemKey(userId, matchdayId),
    }),
  );
  if (!res.Item) return null;
  return unmarshall(res.Item) as RankedMatchdayRecord;
}

function toRankedMatchdayStatus(matchdayId: string, record: RankedMatchdayRecord | null) {
  return {
    matchdayId,
    lockedFixtureId: record?.lockedFixtureId ?? null,
    lockedFixtureLabel: record?.lockedFixtureLabel ?? null,
    played: record?.played ?? false,
    matchPoints: record?.matchPoints ?? null,
  };
}

async function rankedMatchdayStatus(userId: string, matchdayId: string) {
  const record = await loadRankedMatchday(userId, matchdayId);
  return toRankedMatchdayStatus(matchdayId, record);
}

async function lockInRankedMatch(
  userId: string,
  matchdayId: string,
  fixtureId: string,
  fixtureLabel: string,
) {
  await ensureProfile(userId);
  const existing = await loadRankedMatchday(userId, matchdayId);
  if (existing?.played && existing.matchPoints != null) {
    throw new Error('You already played your ranked match this matchday');
  }

  const now = Date.now();
  const item: RankedMatchdayRecord = {
    matchdayId,
    lockedFixtureId: fixtureId,
    lockedFixtureLabel: fixtureLabel,
    played: false,
    lockedAt: now,
  };

  await ddb.send(
    new PutItemCommand({
      TableName: USERS_TABLE,
      Item: marshall({
        PK: `USER#${userId}`,
        SK: `RANKED_MATCHDAY#${matchdayId}`,
        ...item,
        updatedAt: now,
      }),
    }),
  );

  return toRankedMatchdayStatus(matchdayId, item);
}

async function markRankedMatchdayPlayed(
  userId: string,
  matchdayId: string,
  matchPoints: number,
): Promise<void> {
  const existing = await loadRankedMatchday(userId, matchdayId);
  if (existing?.played) return;

  const now = Date.now();
  await ddb.send(
    new PutItemCommand({
      TableName: USERS_TABLE,
      Item: marshall({
        PK: `USER#${userId}`,
        SK: `RANKED_MATCHDAY#${matchdayId}`,
        matchdayId,
        lockedFixtureId: existing?.lockedFixtureId ?? null,
        lockedFixtureLabel: existing?.lockedFixtureLabel ?? null,
        played: true,
        matchPoints,
        lockedAt: existing?.lockedAt ?? now,
        updatedAt: now,
      }),
    }),
  );
}

async function findRankedMatch(userId: string) {
  const matchday = await loadRankedMatchday(userId, DEMO_MATCHDAY_ID);
  // Block only when a ranked match was actually completed (points recorded).
  if (matchday?.played && matchday.matchPoints != null) {
    throw new Error('You already played your ranked match this matchday');
  }
  // Lock-in is enforced client-side before matchmaking; do not require DDB lock
  // (demo often has local lock-in before AWS sync catches up).

  const opponentId = DEMO_OPPONENT[userId];
  if (!opponentId) {
    throw new Error(`No ranked opponent configured for user ${userId}`);
  }

  const profile = await loadProfile(opponentId);
  const tier = profile.tier ?? 'BRONZE';
  const titleId = profile.equippedTitleId;
  const opponentTitle = titleId ? (TITLE_NAMES[titleId] ?? titleId) : null;

  return {
    opponentId,
    opponentName: DEMO_NAMES[opponentId] ?? opponentId,
    opponentTier: tier,
    opponentTitle,
  };
}

async function equipTitle(userId: string, titleId: string): Promise<boolean> {
  const profile = await loadProfile(userId);
  const unlocked = new Set(profile.unlockedTitles ?? []);
  if (!unlocked.has(titleId)) {
    throw new Error(`Title ${titleId} is not unlocked for user ${userId}`);
  }

  await ddb.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: marshall({ PK: `USER#${userId}`, SK: 'PROFILE' }),
      UpdateExpression: 'SET equippedTitleId = :titleId, updatedAt = :ts',
      ExpressionAttributeValues: marshall({
        ':titleId': titleId,
        ':ts': Date.now(),
      }),
    }),
  );

  return true;
}

async function unlockHotTakeHero(userId: string): Promise<boolean> {
  await ensureProfile(userId);
  const profile = await loadProfile(userId);
  const unlocked = new Set(profile.unlockedTitles ?? []);
  if (unlocked.has('hot-take-hero')) return true;

  unlocked.add('hot-take-hero');
  const ts = Date.now();

  await ddb.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: marshall({ PK: `USER#${userId}`, SK: 'PROFILE' }),
      UpdateExpression: 'SET unlockedTitles = :titles, updatedAt = :ts',
      ExpressionAttributeValues: marshall({
        ':titles': Array.from(unlocked),
        ':ts': ts,
      }),
    }),
  );

  try {
    await appsyncMutation(NOTIFY_TITLE_UNLOCKED, {
      userId,
      titleId: 'hot-take-hero',
      titleName: TITLE_NAMES['hot-take-hero'] ?? 'Hot Take Hero',
      ts,
    });
  } catch (err) {
    console.error(JSON.stringify({ msg: 'title unlock publish failed', err: String(err) }));
  }

  return true;
}

async function upsertLeaderboardEntry(
  periodPk: string,
  userId: string,
  points: number,
  profile: UserProfile,
): Promise<void> {
  await ddb.send(
    new PutItemCommand({
      TableName: LEADERBOARDS_TABLE,
      Item: marshall({
        PK: periodPk,
        SK: `USER#${userId}`,
        periodKey: periodPk,
        userId,
        points,
        displayName: DEMO_NAMES[userId] ?? userId,
        equippedTitle: equippedTitleName(profile) ?? null,
        tier: profile.tier ?? 'BRONZE',
        updatedAt: Date.now(),
      }),
    }),
  );
}

async function applyRankedMatchPoints(userId: string, matchPoints: number): Promise<void> {
  if (matchPoints < 0) {
    throw new Error(`matchPoints must be non-negative for ${userId}`);
  }
  if (matchPoints === 0) return;

  const now = Date.now();
  const nextReset = nextMondayMidnightBerlinIso();
  const seasonStarted = new Date().toISOString();

  await ddb.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: marshall({ PK: `USER#${userId}`, SK: 'PROFILE' }),
      UpdateExpression: `
        ADD weeklyPoints :pts, seasonalPoints :pts
        SET weeklyPointsResetAt = if_not_exists(weeklyPointsResetAt, :nextReset),
            seasonNumber = if_not_exists(seasonNumber, :one),
            seasonStartedAt = if_not_exists(seasonStartedAt, :seasonStart),
            updatedAt = :ts
      `,
      ExpressionAttributeValues: marshall({
        ':pts': matchPoints,
        ':nextReset': nextReset,
        ':one': 1,
        ':seasonStart': seasonStarted,
        ':ts': now,
      }),
    }),
  );

  const profile = await loadProfile(userId);
  const isoWeek = getIsoWeekKey();
  const seasonNumber = profile.seasonNumber ?? 1;

  await upsertLeaderboardEntry(
    weeklyLeaderboardPk(isoWeek),
    userId,
    profile.weeklyPoints ?? matchPoints,
    profile,
  );
  await upsertLeaderboardEntry(
    seasonalLeaderboardPk(seasonNumber),
    userId,
    profile.seasonalPoints ?? matchPoints,
    profile,
  );
}

async function publishLeaderboardUpdates(isoWeek: string, seasonNumber: number): Promise<void> {
  const ts = Date.now();
  try {
    await appsyncMutation(PUBLISH_LEADERBOARD_UPDATED, {
      input: { period: 'WEEKLY', isoWeek, seasonNumber: null, updatedAt: ts },
    });
    await appsyncMutation(PUBLISH_LEADERBOARD_UPDATED, {
      input: { period: 'SEASONAL', isoWeek: null, seasonNumber, updatedAt: ts },
    });
  } catch (err) {
    console.error(JSON.stringify({ msg: 'leaderboard publish failed', err: String(err) }));
  }
}

interface MatchTitleStatsInput {
  winnerShotsInMatch?: number;
  winnerCorrectInMatch?: number;
  loserShotsInMatch?: number;
  loserCorrectInMatch?: number;
  winnerPointsAtHalfTime?: number;
  loserPointsAtHalfTime?: number;
}

async function applyMatchShots(
  userId: string,
  shots: number | undefined,
  correct: number | undefined,
): Promise<void> {
  if (shots === undefined || shots <= 0) return;
  const correctN = Math.min(correct ?? 0, shots);
  await ddb.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: marshall({ PK: `USER#${userId}`, SK: 'PROFILE' }),
      UpdateExpression:
        'ADD totalShots :shots, correctShots :correct SET updatedAt = :ts',
      ExpressionAttributeValues: marshall({
        ':shots': shots,
        ':correct': correctN,
        ':ts': Date.now(),
      }),
    }),
  );
  const profile = await loadProfile(userId);
  const acc = lifetimeAccuracyRatio({
    totalShots: profile.totalShots ?? 0,
    correctShots: profile.correctShots ?? 0,
    rankedMatchesPlayed: profile.rankedMatchesPlayed ?? 0,
    unlockedTitles: profile.unlockedTitles ?? [],
  });
  if (acc === null) return;
  await ddb.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: marshall({ PK: `USER#${userId}`, SK: 'PROFILE' }),
      UpdateExpression: 'SET lifetimeAccuracy = :acc, updatedAt = :ts',
      ExpressionAttributeValues: marshall({ ':acc': acc, ':ts': Date.now() }),
    }),
  );
}

function profileTitleStats(profile: UserProfile): TitleStats {
  return {
    totalShots: profile.totalShots ?? 0,
    correctShots: profile.correctShots ?? 0,
    rankedMatchesPlayed: profile.rankedMatchesPlayed ?? 0,
    unlockedTitles: profile.unlockedTitles ?? [],
  };
}

async function persistTitleUnlocks(userId: string, titleIds: string[]): Promise<void> {
  if (titleIds.length === 0) return;
  const profile = await loadProfile(userId);
  const merged = new Set([...(profile.unlockedTitles ?? []), ...titleIds]);
  await ddb.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: marshall({ PK: `USER#${userId}`, SK: 'PROFILE' }),
      UpdateExpression: 'SET unlockedTitles = :titles, updatedAt = :ts',
      ExpressionAttributeValues: marshall({
        ':titles': Array.from(merged),
        ':ts': Date.now(),
      }),
    }),
  );
  const ts = Date.now();
  for (const titleId of titleIds) {
    try {
      await appsyncMutation(NOTIFY_TITLE_UNLOCKED, {
        userId,
        titleId,
        titleName: TITLE_NAMES[titleId] ?? titleId,
        ts,
      });
    } catch (err) {
      console.error(JSON.stringify({ msg: 'title unlock publish failed', err: String(err) }));
    }
  }
}

async function evaluateAndUnlockTitles(
  userId: string,
  matchEnd?: RankedMatchEndContext,
  scope: 'accuracy' | 'matchEnd' | 'all' = 'all',
): Promise<void> {
  const profile = await loadProfile(userId);
  const fresh = evaluateTitleUnlocks(profileTitleStats(profile), matchEnd, scope);
  await persistTitleUnlocks(userId, fresh);
}

async function completeRankedDrawMatch(
  matchId: string,
  player1Id: string,
  player2Id: string,
  matchPoints: number,
  titleInput: MatchTitleStatsInput = {},
) {
  const ts = Date.now();
  const bumpPlayed = async (userId: string) => {
    await ddb.send(
      new UpdateItemCommand({
        TableName: USERS_TABLE,
        Key: marshall({ PK: `USER#${userId}`, SK: 'PROFILE' }),
        UpdateExpression:
          'SET rankedMatchesPlayed = if_not_exists(rankedMatchesPlayed, :zero) + :one, updatedAt = :ts',
        ExpressionAttributeValues: marshall({ ':zero': 0, ':one': 1, ':ts': ts }),
      }),
    );
  };

  await bumpPlayed(player1Id);
  await bumpPlayed(player2Id);

  await applyRankedMatchPoints(player1Id, matchPoints);
  await applyRankedMatchPoints(player2Id, matchPoints);

  await markRankedMatchdayPlayed(player1Id, DEMO_MATCHDAY_ID, matchPoints);
  await markRankedMatchdayPlayed(player2Id, DEMO_MATCHDAY_ID, matchPoints);

  await applyMatchShots(player1Id, titleInput.winnerShotsInMatch, titleInput.winnerCorrectInMatch);
  await applyMatchShots(player2Id, titleInput.loserShotsInMatch, titleInput.loserCorrectInMatch);

  const p1Ht = titleInput.winnerPointsAtHalfTime ?? 0;
  const p2Ht = titleInput.loserPointsAtHalfTime ?? 0;
  const player1End: RankedMatchEndContext = {
    shotsInMatch: titleInput.winnerShotsInMatch ?? 0,
    correctInMatch: titleInput.winnerCorrectInMatch ?? 0,
    pointsAtHalfTime: p1Ht,
    opponentPointsAtHalfTime: p2Ht,
    wonMatch: false,
  };
  const player2End: RankedMatchEndContext = {
    shotsInMatch: titleInput.loserShotsInMatch ?? 0,
    correctInMatch: titleInput.loserCorrectInMatch ?? 0,
    pointsAtHalfTime: p2Ht,
    opponentPointsAtHalfTime: p1Ht,
    wonMatch: false,
  };

  await evaluateAndUnlockTitles(player1Id, player1End, 'matchEnd');
  await evaluateAndUnlockTitles(player2Id, player2End, 'matchEnd');
  await evaluateAndUnlockTitles(player1Id, undefined, 'accuracy');
  await evaluateAndUnlockTitles(player2Id, undefined, 'accuracy');

  const player1Profile = await loadProfile(player1Id);
  const isoWeek = getIsoWeekKey();
  const seasonNumber = player1Profile.seasonNumber ?? 1;
  await publishLeaderboardUpdates(isoWeek, seasonNumber);

  return {
    matchId,
    winnerId: player1Id,
    loserId: player2Id,
    winnerTier: player1Profile.tier ?? 'BRONZE',
    winnerTierWins: player1Profile.tierWinsTowardNext ?? 0,
    promoted: false,
    newTier: null,
    isDraw: true,
    outcome: 'DRAW',
  };
}

async function completeRankedMatch(
  matchId: string,
  winnerId: string,
  loserId: string,
  winnerMatchPoints: number,
  loserMatchPoints: number,
  titleInput: MatchTitleStatsInput = {},
) {
  await ensureProfile(winnerId);
  await ensureProfile(loserId);

  if (winnerMatchPoints === loserMatchPoints) {
    return completeRankedDrawMatch(
      matchId,
      winnerId,
      loserId,
      winnerMatchPoints ?? 0,
      titleInput,
    );
  }

  const winnerProfile = await loadProfile(winnerId);
  const currentTier = winnerProfile.tier ?? 'BRONZE';
  let tierWins = (winnerProfile.tierWinsTowardNext ?? 0) + 1;
  let promoted = false;
  let newTier: Tier | null = null;

  const threshold = WINS_TO_ADVANCE[currentTier];
  if (threshold !== null && tierWins >= threshold) {
    const idx = TIER_ORDER.indexOf(currentTier);
    if (idx >= 0 && idx < TIER_ORDER.length - 1) {
      promoted = true;
      newTier = TIER_ORDER[idx + 1]!;
      tierWins = 0;
    }
  }

  const winnerTier: Tier = promoted && newTier ? newTier : currentTier;

  await ddb.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: marshall({ PK: `USER#${winnerId}`, SK: 'PROFILE' }),
      UpdateExpression:
        'SET tier = :tier, tierWinsTowardNext = :wins, rankedMatchesPlayed = if_not_exists(rankedMatchesPlayed, :zero) + :one, updatedAt = :ts',
      ExpressionAttributeValues: marshall({
        ':tier': winnerTier,
        ':wins': tierWins,
        ':zero': 0,
        ':one': 1,
        ':ts': Date.now(),
      }),
    }),
  );

  await ddb.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: marshall({ PK: `USER#${loserId}`, SK: 'PROFILE' }),
      UpdateExpression:
        'SET rankedMatchesPlayed = if_not_exists(rankedMatchesPlayed, :zero) + :one, updatedAt = :ts',
      ExpressionAttributeValues: marshall({
        ':zero': 0,
        ':one': 1,
        ':ts': Date.now(),
      }),
    }),
  );

  await applyRankedMatchPoints(winnerId, winnerMatchPoints ?? 0);
  await applyRankedMatchPoints(loserId, loserMatchPoints ?? 0);

  await markRankedMatchdayPlayed(winnerId, DEMO_MATCHDAY_ID, winnerMatchPoints ?? 0);
  await markRankedMatchdayPlayed(loserId, DEMO_MATCHDAY_ID, loserMatchPoints ?? 0);

  await applyMatchShots(winnerId, titleInput.winnerShotsInMatch, titleInput.winnerCorrectInMatch);
  await applyMatchShots(loserId, titleInput.loserShotsInMatch, titleInput.loserCorrectInMatch);

  const winnerHt = titleInput.winnerPointsAtHalfTime ?? 0;
  const loserHt = titleInput.loserPointsAtHalfTime ?? 0;
  const winnerEnd: RankedMatchEndContext = {
    shotsInMatch: titleInput.winnerShotsInMatch ?? 0,
    correctInMatch: titleInput.winnerCorrectInMatch ?? 0,
    pointsAtHalfTime: winnerHt,
    opponentPointsAtHalfTime: loserHt,
    wonMatch: true,
  };
  const loserEnd: RankedMatchEndContext = {
    shotsInMatch: titleInput.loserShotsInMatch ?? 0,
    correctInMatch: titleInput.loserCorrectInMatch ?? 0,
    pointsAtHalfTime: loserHt,
    opponentPointsAtHalfTime: winnerHt,
    wonMatch: false,
  };

  await evaluateAndUnlockTitles(winnerId, winnerEnd, 'matchEnd');
  await evaluateAndUnlockTitles(loserId, loserEnd, 'matchEnd');
  await evaluateAndUnlockTitles(winnerId, undefined, 'accuracy');
  await evaluateAndUnlockTitles(loserId, undefined, 'accuracy');

  const isoWeek = getIsoWeekKey();
  const seasonNumber = (await loadProfile(winnerId)).seasonNumber ?? 1;
  await publishLeaderboardUpdates(isoWeek, seasonNumber);

  if (promoted && newTier) {
    const ts = Date.now();
    try {
      await appsyncMutation(NOTIFY_TIER_PROMOTED, {
        userId: winnerId,
        previousTier: currentTier,
        newTier,
        ts,
      });
    } catch (err) {
      console.error(JSON.stringify({ msg: 'tier promoted publish failed', err: String(err) }));
    }
  }

  return {
    matchId,
    winnerId,
    loserId,
    winnerTier,
    winnerTierWins: tierWins,
    promoted,
    newTier: promoted ? newTier : null,
    isDraw: false,
    outcome: null,
  };
}
