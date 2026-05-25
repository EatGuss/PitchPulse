/**
 * Local weekly / seasonal standings for demo mode (no AWS env vars).
 */

import { DEMO_USERS, type DemoUserId } from '../data/personas';
import type { LeaderboardEntry, UserStats } from '../domain/leaderboardTypes';
import type { Tier } from '../domain/tiers';
import { TypedEventBus } from './eventBus';

const DEMO_TIER: Record<DemoUserId, Tier> = {
  alice: 'SILVER',
  bob: 'GOLD',
};

const DEMO_TITLE: Record<DemoUserId, string> = {
  alice: 'Sharpshooter',
  bob: 'Sharpshooter',
};

interface StandingRow {
  weeklyPoints: number;
  seasonalPoints: number;
}

const DEMO_SEED_ROWS: ReadonlyArray<readonly [DemoUserId, StandingRow]> = [
  ['alice', { weeklyPoints: 4200, seasonalPoints: 18_400 }],
  ['bob', { weeklyPoints: 3900, seasonalPoints: 17_100 }],
];

const byUser = new Map<DemoUserId, StandingRow>(DEMO_SEED_ROWS.map(([id, row]) => [id, { ...row }]));

const bus = new TypedEventBus<{ changed: undefined }>();

const DEMO_SEASON_NUMBER = 1;
const DEMO_WEEKLY_RESET_AT = '2026-05-27T22:00:00.000Z';
const DEMO_SEASON_ENDS_AT = '2026-07-25T21:59:59.000Z';

function notify(): void {
  bus.emit('changed', undefined);
}

function sortedEntries(pointsKey: 'weeklyPoints' | 'seasonalPoints', limit: number): LeaderboardEntry[] {
  const rows = (Object.keys(DEMO_USERS) as DemoUserId[])
    .map((userId) => {
      const standing = byUser.get(userId)!;
      return {
        userId,
        displayName: DEMO_USERS[userId].displayName,
        equippedTitle: DEMO_TITLE[userId],
        tier: DEMO_TIER[userId],
        points: standing[pointsKey],
      };
    })
    .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName))
    .slice(0, limit);

  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

function computeRank(entries: LeaderboardEntry[], userId: string, points: number): number | null {
  const idx = entries.findIndex((e) => e.userId === userId);
  if (idx >= 0) return idx + 1;
  if (points <= 0) return null;
  const above = entries.filter((e) => e.points > points).length;
  return above + 1;
}

export function localAddRankedStandingsPoints(userId: DemoUserId, matchPoints: number): void {
  if (matchPoints <= 0) return;
  const row = byUser.get(userId);
  if (!row) return;
  row.weeklyPoints += matchPoints;
  row.seasonalPoints += matchPoints;
  notify();
}

export function localGetWeeklyLeaderboard(limit = 100): LeaderboardEntry[] {
  return sortedEntries('weeklyPoints', limit);
}

export function localGetSeasonalLeaderboard(limit = 100): LeaderboardEntry[] {
  return sortedEntries('seasonalPoints', limit);
}

export function localGetUserStats(userId: DemoUserId): UserStats {
  const row = byUser.get(userId) ?? { weeklyPoints: 0, seasonalPoints: 0 };
  const weekly = localGetWeeklyLeaderboard(100);
  const seasonal = localGetSeasonalLeaderboard(100);
  return {
    userId,
    weeklyPoints: row.weeklyPoints,
    weeklyRank: computeRank(weekly, userId, row.weeklyPoints),
    seasonalPoints: row.seasonalPoints,
    seasonalRank: computeRank(seasonal, userId, row.seasonalPoints),
    seasonNumber: DEMO_SEASON_NUMBER,
    seasonEndsAt: DEMO_SEASON_ENDS_AT,
    weeklyPointsResetAt: DEMO_WEEKLY_RESET_AT,
    tier: DEMO_TIER[userId] ?? 'BRONZE',
    equippedTitleId: DEMO_TITLE[userId] ? 'sharpshooter' : null,
    equippedTitle: DEMO_TITLE[userId] ?? null,
    unlockedTitleIds: userId === 'alice'
      ? ['sharpshooter', 'sniper', 'analyst', 'veteran']
      : ['sharpshooter', 'oracle', 'comeback-king', 'veteran'],
    tierWinsTowardNext: userId === 'alice' ? 4 : 4,
    lifetimeAccuracy: userId === 'alice' ? 0.62 : 0.58,
    rankedMatchesPlayed: userId === 'alice' ? 12 : 15,
  };
}

export function subscribeLocalLeaderboardChanged(onChange: () => void): () => void {
  return bus.on('changed', onChange);
}

/** Restore demo seed standings (dev reset). */
export function resetLocalLeaderboardStore(): void {
  byUser.clear();
  for (const [userId, row] of DEMO_SEED_ROWS) {
    byUser.set(userId, { ...row });
  }
  notify();
}
