/**
 * Local Me-tab profile, titles, and match history (demo / offline).
 */

import type { DemoUserId } from '../data/personas';
import type { MatchHistoryEntry, MatchHistoryResult, MeProfile } from '../domain/profileTypes';
import type { Tier } from '../domain/tiers';
import { titleDisplayName } from '../domain/titles';
import { WINS_TO_ADVANCE } from '../domain/tiers';
import { TypedEventBus } from './eventBus';

interface ProfileRow {
  tier: Tier;
  tierWinsTowardNext: number;
  equippedTitleId: string | null;
  unlockedTitleIds: string[];
  lifetimeAccuracy: number | null;
  rankedMatchesPlayed: number;
  matchHistory: MatchHistoryEntry[];
}

const bus = new TypedEventBus<{ changed: undefined }>();

const SEED_HISTORY: Record<DemoUserId, MatchHistoryEntry[]> = {
  alice: [
    {
      id: 'h-alice-1',
      playedAt: '2026-05-18T18:30:00.000Z',
      mode: 'Ranked',
      opponent: 'Bob',
      points: 520,
      result: 'Win',
      fixtureLabel: 'Bayern v Dortmund',
    },
    {
      id: 'h-alice-2',
      playedAt: '2026-05-11T20:30:00.000Z',
      mode: 'Ranked',
      opponent: 'Bob',
      points: 340,
      result: 'Loss',
      fixtureLabel: 'Leipzig v Leverkusen',
    },
  ],
  bob: [
    {
      id: 'h-bob-1',
      playedAt: '2026-05-18T18:30:00.000Z',
      mode: 'Ranked',
      opponent: 'Alice',
      points: 410,
      result: 'Loss',
      fixtureLabel: 'Bayern v Dortmund',
    },
    {
      id: 'h-bob-2',
      playedAt: '2026-05-04T15:30:00.000Z',
      mode: 'Ranked',
      opponent: 'Alice',
      points: 610,
      result: 'Win',
      fixtureLabel: 'Frankfurt v Stuttgart',
    },
  ],
};

const byUser = new Map<DemoUserId, ProfileRow>([
  [
    'alice',
    {
      tier: 'SILVER',
      tierWinsTowardNext: 4,
      equippedTitleId: 'sharpshooter',
      unlockedTitleIds: ['sharpshooter', 'sniper', 'analyst', 'veteran'],
      lifetimeAccuracy: 0.62,
      rankedMatchesPlayed: 12,
      matchHistory: [...SEED_HISTORY.alice],
    },
  ],
  [
    'bob',
    {
      tier: 'GOLD',
      tierWinsTowardNext: 4,
      equippedTitleId: 'sharpshooter',
      unlockedTitleIds: ['sharpshooter', 'oracle', 'comeback-king', 'veteran'],
      lifetimeAccuracy: 0.58,
      rankedMatchesPlayed: 15,
      matchHistory: [...SEED_HISTORY.bob],
    },
  ],
]);

function notify(): void {
  bus.emit('changed', undefined);
}

function nextTier(tier: Tier): Tier | null {
  const order: Tier[] = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'CHAMPION'];
  const idx = order.indexOf(tier);
  if (idx < 0 || idx >= order.length - 1) return null;
  return order[idx + 1]!;
}

export function localGetMeProfile(
  userId: DemoUserId,
  weeklyPoints: number,
  seasonalPoints: number,
): MeProfile {
  const row = byUser.get(userId);
  if (!row) {
    return {
      userId,
      tier: 'BRONZE',
      tierWinsTowardNext: 0,
      equippedTitleId: null,
      equippedTitle: null,
      unlockedTitleIds: [],
      weeklyPoints,
      seasonalPoints,
      lifetimeAccuracy: null,
      rankedMatchesPlayed: 0,
      matchHistory: [],
    };
  }
  const titleId = row.equippedTitleId;
  return {
    userId,
    tier: row.tier,
    tierWinsTowardNext: row.tierWinsTowardNext,
    equippedTitleId: titleId,
    equippedTitle: titleId ? titleDisplayName(titleId) : null,
    unlockedTitleIds: [...row.unlockedTitleIds],
    weeklyPoints,
    seasonalPoints,
    lifetimeAccuracy: row.lifetimeAccuracy,
    rankedMatchesPlayed: row.rankedMatchesPlayed,
    matchHistory: row.matchHistory.slice(0, 5),
  };
}

export function localEquipTitle(userId: DemoUserId, titleId: string): boolean {
  const row = byUser.get(userId);
  if (!row || !row.unlockedTitleIds.includes(titleId)) return false;
  row.equippedTitleId = titleId;
  notify();
  return true;
}

export function localUnlockTitle(userId: DemoUserId, titleId: string): boolean {
  const row = byUser.get(userId);
  if (!row) return false;
  if (row.unlockedTitleIds.includes(titleId)) return true;
  row.unlockedTitleIds = [...row.unlockedTitleIds, titleId];
  notify();
  return true;
}

export function localRecordRankedMatchHistory(
  userId: DemoUserId,
  fixtureLabel: string,
  opponentName: string,
  matchPoints: number,
  opponentPoints: number,
): void {
  const row = byUser.get(userId);
  if (!row) return;

  let result: MatchHistoryResult = 'Draw';
  if (matchPoints > opponentPoints) result = 'Win';
  else if (matchPoints < opponentPoints) result = 'Loss';

  const entry: MatchHistoryEntry = {
    id: `h-${userId}-${Date.now()}`,
    playedAt: new Date().toISOString(),
    mode: 'Ranked',
    opponent: opponentName,
    points: matchPoints,
    result,
    fixtureLabel,
  };

  row.matchHistory = [entry, ...row.matchHistory].slice(0, 5);
  row.rankedMatchesPlayed += 1;
  notify();
}

export function localGetTierProgress(userId: DemoUserId): {
  tier: Tier;
  winsTowardNext: number;
  winsNeeded: number | null;
  nextTier: Tier | null;
} {
  const row = byUser.get(userId)!;
  const winsNeeded = WINS_TO_ADVANCE[row.tier];
  return {
    tier: row.tier,
    winsTowardNext: row.tierWinsTowardNext,
    winsNeeded,
    nextTier: nextTier(row.tier),
  };
}

export function resetLocalProfileStore(): void {
  byUser.clear();
  for (const [userId, seed] of Object.entries(SEED_HISTORY) as [DemoUserId, MatchHistoryEntry[]][]) {
    const defaults = userId === 'alice'
      ? {
          tier: 'SILVER' as Tier,
          tierWinsTowardNext: 4,
          equippedTitleId: 'sharpshooter',
          unlockedTitleIds: ['sharpshooter', 'sniper', 'analyst', 'veteran'],
          lifetimeAccuracy: 0.62,
          rankedMatchesPlayed: 12,
        }
      : {
          tier: 'GOLD' as Tier,
          tierWinsTowardNext: 4,
          equippedTitleId: 'sharpshooter',
          unlockedTitleIds: ['sharpshooter', 'oracle', 'comeback-king', 'veteran'],
          lifetimeAccuracy: 0.58,
          rankedMatchesPlayed: 15,
        };
    byUser.set(userId, { ...defaults, matchHistory: [...seed] });
  }
  notify();
}

export function subscribeLocalProfileChanged(onChange: () => void): () => void {
  return bus.on('changed', onChange);
}
