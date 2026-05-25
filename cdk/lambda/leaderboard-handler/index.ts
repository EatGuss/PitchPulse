/**
 * leaderboard-handler — AppSync Lambda data source:
 *   weeklyLeaderboard, seasonalLeaderboard, userStats
 */

import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { AppSyncResolverEvent } from 'aws-lambda';
import {
  getIsoWeekKey,
  seasonalLeaderboardPk,
  seasonEndsAtIso,
  weeklyLeaderboardPk,
} from '../shared/periods';

const REGION = process.env.AWS_REGION ?? 'eu-central-1';
const USERS_TABLE = required('USERS_TABLE');
const LEADERBOARDS_TABLE = required('LEADERBOARDS_TABLE');

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

interface UserProfile {
  tier?: Tier;
  weeklyPoints?: number;
  weeklyPointsResetAt?: string;
  seasonalPoints?: number;
  seasonNumber?: number;
  seasonStartedAt?: string;
  equippedTitleId?: string;
  unlockedTitles?: string[];
  tierWinsTowardNext?: number;
  lifetimeAccuracy?: number;
  rankedMatchesPlayed?: number;
}

interface LeaderboardRow {
  userId: string;
  points: number;
  displayName?: string;
  equippedTitle?: string;
  tier?: Tier;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const ddb = new DynamoDBClient({ region: REGION });

export const handler = async (event: AppSyncResolverEvent<Record<string, unknown>>) => {
  switch (event.info.fieldName) {
    case 'weeklyLeaderboard':
      return weeklyLeaderboard((event.arguments.limit as number | undefined) ?? 100);
    case 'seasonalLeaderboard':
      return seasonalLeaderboard(
        event.arguments.seasonNumber as number | undefined,
        (event.arguments.limit as number | undefined) ?? 100,
      );
    case 'userStats':
      return userStats(event.arguments.userId as string);
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
      weeklyPoints: 0,
      seasonalPoints: 0,
      seasonNumber: 1,
      rankedMatchesPlayed: 0,
    };
  }
  return unmarshall(res.Item) as UserProfile;
}

async function queryLeaderboard(periodKey: string, limit: number): Promise<LeaderboardRow[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: LEADERBOARDS_TABLE,
      IndexName: 'PointsRankIndex',
      KeyConditionExpression: 'periodKey = :pk',
      ExpressionAttributeValues: marshall({ ':pk': periodKey }),
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (res.Items ?? []).map((item) => {
    const row = unmarshall(item) as LeaderboardRow;
    return {
      userId: row.userId,
      points: row.points ?? 0,
      displayName: row.displayName,
      equippedTitle: row.equippedTitle,
      tier: row.tier ?? 'BRONZE',
    };
  });
}

function toEntries(rows: LeaderboardRow[]) {
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    displayName: r.displayName ?? r.userId,
    equippedTitle: r.equippedTitle ?? null,
    tier: r.tier ?? 'BRONZE',
    points: r.points,
  }));
}

async function weeklyLeaderboard(limit: number) {
  const isoWeek = getIsoWeekKey();
  const rows = await queryLeaderboard(weeklyLeaderboardPk(isoWeek), limit);
  return toEntries(rows);
}

async function seasonalLeaderboard(seasonNumber: number | undefined, limit: number) {
  const season = seasonNumber ?? 1;
  const rows = await queryLeaderboard(seasonalLeaderboardPk(season), limit);
  return toEntries(rows);
}

async function computeRank(periodKey: string, userId: string, userPoints: number): Promise<number | null> {
  const rows = await queryLeaderboard(periodKey, 100);
  const idx = rows.findIndex((r) => r.userId === userId);
  if (idx >= 0) return idx + 1;
  if (userPoints <= 0) return null;
  const above = rows.filter((r) => r.points > userPoints).length;
  return above + 1;
}

async function userStats(userId: string) {
  const profile = await loadProfile(userId);
  const isoWeek = getIsoWeekKey();
  const seasonNumber = profile.seasonNumber ?? 1;
  const weeklyPoints = profile.weeklyPoints ?? 0;
  const seasonalPoints = profile.seasonalPoints ?? 0;
  const titleId = profile.equippedTitleId;

  const [weeklyRank, seasonalRank] = await Promise.all([
    computeRank(weeklyLeaderboardPk(isoWeek), userId, weeklyPoints),
    computeRank(seasonalLeaderboardPk(seasonNumber), userId, seasonalPoints),
  ]);

  return {
    userId,
    weeklyPoints,
    weeklyRank,
    seasonalPoints,
    seasonalRank,
    seasonNumber,
    seasonEndsAt: seasonEndsAtIso(profile.seasonStartedAt),
    weeklyPointsResetAt: profile.weeklyPointsResetAt ?? null,
    tier: profile.tier ?? 'BRONZE',
    equippedTitleId: titleId ?? null,
    equippedTitle: titleId ? (TITLE_NAMES[titleId] ?? titleId) : null,
    unlockedTitles: profile.unlockedTitles ?? [],
    tierWinsTowardNext: profile.tierWinsTowardNext ?? 0,
    lifetimeAccuracy: profile.lifetimeAccuracy ?? null,
    rankedMatchesPlayed: profile.rankedMatchesPlayed ?? 0,
  };
}
