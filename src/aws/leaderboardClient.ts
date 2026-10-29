/**
 * Weekly / seasonal standings — AWS GraphQL with local demo fallback (Gate F).
 */

import { VIEWER, gql, gqlSubscribe } from './session';
import type { DemoUserId } from '../data/personas';
import type { LeaderboardEntry, StandingsPeriod, UserStats } from '../domain/leaderboardTypes';
import { normalizeLifetimeAccuracy } from '../domain/accuracy';
import type { Tier } from '../domain/tiers';
import {
  localGetSeasonalLeaderboard,
  localGetUserStats,
  localGetWeeklyLeaderboard,
  subscribeLocalLeaderboardChanged,
} from '../sim/localLeaderboardStore';
import { isAwsMode } from './config';
import {
  SEASONAL_LEADERBOARD,
  SUB_LEADERBOARD_UPDATED,
  USER_STATS,
  WEEKLY_LEADERBOARD,
} from './operations';

interface GraphqlLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  equippedTitle: string | null;
  tier: Tier;
  points: number;
}

interface GraphqlUserStats {
  userId: string;
  weeklyPoints: number;
  weeklyRank: number | null;
  seasonalPoints: number;
  seasonalRank: number | null;
  seasonNumber: number;
  seasonEndsAt: string | null;
  weeklyPointsResetAt: string | null;
  tier: Tier;
  equippedTitleId: string | null;
  equippedTitle: string | null;
  unlockedTitles: string[] | null;
  tierWinsTowardNext: number | null;
  lifetimeAccuracy: number | null;
  rankedMatchesPlayed: number | null;
}

function mapEntry(row: GraphqlLeaderboardEntry): LeaderboardEntry {
  return {
    rank: row.rank,
    userId: row.userId,
    displayName: row.displayName,
    equippedTitle: row.equippedTitle,
    tier: row.tier,
    points: row.points,
  };
}

function mapUserStats(row: GraphqlUserStats): UserStats {
  return {
    userId: row.userId,
    weeklyPoints: row.weeklyPoints,
    weeklyRank: row.weeklyRank,
    seasonalPoints: row.seasonalPoints,
    seasonalRank: row.seasonalRank,
    seasonNumber: row.seasonNumber,
    seasonEndsAt: row.seasonEndsAt,
    weeklyPointsResetAt: row.weeklyPointsResetAt,
    tier: row.tier,
    equippedTitleId: row.equippedTitleId ?? null,
    equippedTitle: row.equippedTitle,
    unlockedTitleIds: row.unlockedTitles ?? [],
    tierWinsTowardNext: row.tierWinsTowardNext ?? 0,
    lifetimeAccuracy: normalizeLifetimeAccuracy(row.lifetimeAccuracy),
    rankedMatchesPlayed: row.rankedMatchesPlayed ?? 0,
  };
}

export async function fetchWeeklyLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  if (!isAwsMode) return localGetWeeklyLeaderboard(limit);

  const res = await gql<{ weeklyLeaderboard: GraphqlLeaderboardEntry[] }>(VIEWER, WEEKLY_LEADERBOARD, {
    limit,
  });

  return (res.data?.weeklyLeaderboard ?? []).map(mapEntry);
}

export async function fetchSeasonalLeaderboard(
  seasonNumber = 1,
  limit = 50,
): Promise<LeaderboardEntry[]> {
  if (!isAwsMode) return localGetSeasonalLeaderboard(limit);

  const res = await gql<{ seasonalLeaderboard: GraphqlLeaderboardEntry[] }>(
    VIEWER,
    SEASONAL_LEADERBOARD,
    { seasonNumber, limit },
  );

  return (res.data?.seasonalLeaderboard ?? []).map(mapEntry);
}

export async function fetchUserStats(userId: DemoUserId): Promise<UserStats> {
  if (!isAwsMode) return localGetUserStats(userId);

  try {
    // userStats is a public read: userId names whose stats, not who is asking.
    const res = await gql<{ userStats: GraphqlUserStats | null }>(userId, USER_STATS, { userId });

    if (res.errors?.length) {
      throw new Error(res.errors.map((e) => e.message).join('; '));
    }

    const stats = res.data?.userStats;
    if (!stats) return localGetUserStats(userId);
    return mapUserStats(stats);
  } catch (err) {
    console.warn('[leaderboard] userStats fetch failed — using local fallback', err);
    return localGetUserStats(userId);
  }
}

function graphqlPeriod(period: StandingsPeriod): 'WEEKLY' | 'SEASONAL' {
  return period === 'weekly' ? 'WEEKLY' : 'SEASONAL';
}

function subscribeAwsPeriod(
  period: StandingsPeriod,
  onUpdate: (period: StandingsPeriod) => void,
): () => void {
  return gqlSubscribe<{
    leaderboardUpdated: { period: 'WEEKLY' | 'SEASONAL'; updatedAt: number };
  }>(
    VIEWER,
    SUB_LEADERBOARD_UPDATED,
    { period: graphqlPeriod(period) },
    {
      next: (data) => {
        if (!data?.leaderboardUpdated) return;
        onUpdate(data.leaderboardUpdated.period === 'WEEKLY' ? 'weekly' : 'seasonal');
      },
      error: (err) => console.error('[leaderboard] subscription error', period, err),
    },
  );
}

/** Refresh callback when weekly or seasonal standings change. */
export function subscribeLeaderboardUpdated(
  onUpdate: (period: StandingsPeriod) => void,
): () => void {
  if (!isAwsMode) {
    return subscribeLocalLeaderboardChanged(() => onUpdate('weekly'));
  }

  const offWeekly = subscribeAwsPeriod('weekly', onUpdate);
  const offSeasonal = subscribeAwsPeriod('seasonal', onUpdate);
  return () => {
    offWeekly();
    offSeasonal();
  };
}
