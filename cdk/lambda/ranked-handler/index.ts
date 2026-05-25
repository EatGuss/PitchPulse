/**
 * ranked-handler — AppSync Lambda data source for Ranked mode + Titles:
 *   findRankedMatch, equipTitle, completeRankedMatch
 *
 * pp-users single-table layout (PK/SK):
 *   USER#<id> / PROFILE              — tier, tierWinsTowardNext, accuracy stats, equippedTitleId, unlockedTitles
 *   USER#<id> / TITLE_PROGRESS#<id>  — per-title progress counters for locked titles
 *
 * Access patterns:
 *   AP1 — Tier + profile lookup:     GetItem USER#<id> / PROFILE
 *   AP2 — Title progress by user:    Query PK=USER#<id>, SK begins_with TITLE_PROGRESS#
 *   AP3 — Title unlock (atomic):     UpdateItem PROFILE ADD unlockedTitles + optional PutItem TITLE_PROGRESS#
 */

import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { AppSyncResolverEvent } from 'aws-lambda';

const REGION = process.env.AWS_REGION ?? 'eu-central-1';
const USERS_TABLE = required('USERS_TABLE');

const DEMO_OPPONENT: Record<string, string> = {
  alice: 'bob',
  bob: 'alice',
};

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
}

export const handler = async (event: AppSyncResolverEvent<Record<string, unknown>>) => {
  switch (event.info.fieldName) {
    case 'findRankedMatch':
      return findRankedMatch(event.arguments.userId as string);
    case 'equipTitle':
      return equipTitle(event.arguments.userId as string, event.arguments.titleId as string);
    case 'completeRankedMatch':
      return completeRankedMatch(
        event.arguments.matchId as string,
        event.arguments.winnerId as string,
        event.arguments.loserId as string,
      );
    default:
      throw new Error(`Unsupported field: ${event.info.fieldName}`);
  }
};

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
    };
  }
  return unmarshall(res.Item) as UserProfile;
}

async function findRankedMatch(userId: string) {
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

async function completeRankedMatch(matchId: string, winnerId: string, loserId: string) {
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
