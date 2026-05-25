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
import { appsyncMutation, NOTIFY_TITLE_UNLOCKED, PUBLISH_LEADERBOARD_UPDATED } from '../shared/appsyncPublish';
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
  if (existing?.played) {
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
  if (matchday?.played) {
    throw new Error('You already played your ranked match this matchday');
  }
  if (!matchday?.lockedFixtureId) {
    throw new Error('Lock in a ranked match before matchmaking');
  }

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

async function completeRankedMatch(
  matchId: string,
  winnerId: string,
  loserId: string,
  winnerMatchPoints: number,
  loserMatchPoints: number,
) {
  await ensureProfile(winnerId);
  await ensureProfile(loserId);

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

  const isoWeek = getIsoWeekKey();
  const seasonNumber = (await loadProfile(winnerId)).seasonNumber ?? 1;
  await publishLeaderboardUpdates(isoWeek, seasonNumber);

  return {
    matchId,
    winnerId,
    loserId,
    winnerTier,
    winnerTierWins: tierWins,
    promoted,
    newTier: promoted ? newTier : null,
  };
}
