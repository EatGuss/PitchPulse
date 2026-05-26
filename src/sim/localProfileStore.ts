/**
 * Local Me-tab profile, titles, and match history (demo / offline).
 */

import type { DemoUserId } from '../data/personas';
import type { MatchHistoryEntry, MatchHistoryResult, MeProfile } from '../domain/profileTypes';
import type { Tier } from '../domain/tiers';
import {
  evaluateTitleUnlocks,
  filterValidUnlockedTitleIds,
  lifetimeAccuracyRatio,
  titlesEarnedByLifetimeStats,
  type RankedMatchEndContext,
  type TitleStats,
} from '../domain/titleRules';
import { titleDisplayName } from '../domain/titles';
import { WINS_TO_ADVANCE } from '../domain/tiers';
import { TypedEventBus } from './eventBus';

interface ProfileRow {
  tier: Tier;
  tierWinsTowardNext: number;
  equippedTitleId: string | null;
  unlockedTitleIds: string[];
  totalShots: number;
  correctShots: number;
  lifetimeAccuracy: number | null;
  rankedMatchesPlayed: number;
  matchHistory: MatchHistoryEntry[];
}

function syncAccuracy(row: ProfileRow): void {
  row.lifetimeAccuracy = lifetimeAccuracyRatio({
    totalShots: row.totalShots,
    correctShots: row.correctShots,
    rankedMatchesPlayed: row.rankedMatchesPlayed,
    unlockedTitleIds: row.unlockedTitleIds,
  });
}

function rowTitleStats(row: ProfileRow): TitleStats {
  return {
    totalShots: row.totalShots,
    correctShots: row.correctShots,
    rankedMatchesPlayed: row.rankedMatchesPlayed,
    unlockedTitleIds: row.unlockedTitleIds,
  };
}

function applyUnlocks(row: ProfileRow, ids: string[]): string[] {
  const fresh = ids.filter((id) => !row.unlockedTitleIds.includes(id));
  if (fresh.length === 0) return [];
  row.unlockedTitleIds = [...row.unlockedTitleIds, ...fresh];
  syncAccuracy(row);
  notify();
  return fresh;
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

/** Style titles seeded as already earned (not derivable from lifetime stats alone). */
const DEMO_STYLE_TITLES: Record<DemoUserId, string[]> = {
  alice: [],
  bob: ['comeback-king', 'hot-take-hero'],
};

function buildSeedRow(
  userId: DemoUserId,
  partial: Omit<ProfileRow, 'matchHistory' | 'unlockedTitleIds' | 'lifetimeAccuracy'>,
): ProfileRow {
  const style = DEMO_STYLE_TITLES[userId];
  const unlockedTitleIds = [
    ...new Set([...titlesEarnedByLifetimeStats(partial), ...style]),
  ];
  const row: ProfileRow = {
    ...partial,
    unlockedTitleIds,
    lifetimeAccuracy: null,
    matchHistory: [...SEED_HISTORY[userId]],
  };
  syncAccuracy(row);
  return row;
}

const byUser = new Map<DemoUserId, ProfileRow>([
  [
    'alice',
    buildSeedRow('alice', {
      tier: 'SILVER',
      tierWinsTowardNext: 4,
      equippedTitleId: 'sharpshooter',
      totalShots: 48,
      correctShots: 34,
      rankedMatchesPlayed: 43,
    }),
  ],
  [
    'bob',
    buildSeedRow('bob', {
      tier: 'GOLD',
      tierWinsTowardNext: 4,
      equippedTitleId: 'comeback-king',
      totalShots: 62,
      correctShots: 45,
      rankedMatchesPlayed: 15,
    }),
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
      totalShots: 0,
      correctShots: 0,
      rankedMatchesPlayed: 0,
      matchHistory: [],
    };
  }
  const titleId = row.equippedTitleId;
  const titleStats = rowTitleStats(row);
  const unlockedTitleIds = filterValidUnlockedTitleIds(titleStats, row.unlockedTitleIds);
  const equippedTitleId =
    titleId && unlockedTitleIds.includes(titleId) ? titleId : unlockedTitleIds[0] ?? null;
  return {
    userId,
    tier: row.tier,
    tierWinsTowardNext: row.tierWinsTowardNext,
    equippedTitleId,
    equippedTitle: equippedTitleId ? titleDisplayName(equippedTitleId) : null,
    unlockedTitleIds,
    weeklyPoints,
    seasonalPoints,
    lifetimeAccuracy: row.lifetimeAccuracy,
    totalShots: row.totalShots,
    correctShots: row.correctShots,
    rankedMatchesPlayed: row.rankedMatchesPlayed,
    matchHistory: row.matchHistory.slice(0, 5),
  };
}

export function localGetTitleStats(userId: DemoUserId): TitleStats {
  const row = byUser.get(userId);
  if (!row) {
    return { totalShots: 0, correctShots: 0, rankedMatchesPlayed: 0, unlockedTitleIds: [] };
  }
  return rowTitleStats(row);
}

/** Record one resolved prompt vote; returns newly unlocked title ids. */
export function localRecordPromptShot(userId: DemoUserId, correct: boolean): string[] {
  const row = byUser.get(userId);
  if (!row) return [];
  row.totalShots += 1;
  if (correct) row.correctShots += 1;
  syncAccuracy(row);
  return applyUnlocks(row, evaluateTitleUnlocks(rowTitleStats(row), undefined, 'accuracy'));
}

/** After ranked match ends — match-end titles (comeback, perfect). */
export function localUnlockTitlesFromMatch(
  userId: DemoUserId,
  matchEnd: RankedMatchEndContext,
): string[] {
  const row = byUser.get(userId);
  if (!row) return [];
  return applyUnlocks(row, evaluateTitleUnlocks(rowTitleStats(row), matchEnd, 'matchEnd'));
}

/** Volume / accuracy titles after rankedMatchesPlayed increments. */
export function localEvaluateVolumeTitles(userId: DemoUserId): string[] {
  const row = byUser.get(userId);
  if (!row) return [];
  return applyUnlocks(row, evaluateTitleUnlocks(rowTitleStats(row), undefined, 'accuracy'));
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
  if (row.unlockedTitleIds.includes(titleId)) return false;
  row.unlockedTitleIds = [...row.unlockedTitleIds, titleId];
  notify();
  return true;
}

/** Mirror server completeRankedMatch outcome into local demo profile (AWS path). */
export function localSyncRankedMatchResult(
  winnerId: DemoUserId,
  loserId: DemoUserId,
  result: {
    winnerTier: Tier;
    winnerTierWins: number;
    promoted: boolean;
    newTier: Tier | null;
    isDraw?: boolean;
  },
): void {
  if (result.isDraw) {
    const player1 = byUser.get(winnerId);
    const player2 = byUser.get(loserId);
    if (player1) player1.rankedMatchesPlayed += 1;
    if (player2) player2.rankedMatchesPlayed += 1;
    notify();
    return;
  }

  const winner = byUser.get(winnerId);
  if (winner) {
    winner.tier = result.winnerTier;
    winner.tierWinsTowardNext = result.winnerTierWins;
    winner.rankedMatchesPlayed += 1;
  }
  const loser = byUser.get(loserId);
  if (loser) {
    loser.rankedMatchesPlayed += 1;
  }
  notify();
}

export function localCompleteRankedDrawMatch(
  matchId: string,
  player1Id: DemoUserId,
  player2Id: DemoUserId,
): {
  matchId: string;
  winnerId: string;
  loserId: string;
  winnerTier: Tier;
  winnerTierWins: number;
  promoted: boolean;
  newTier: Tier | null;
  isDraw: boolean;
  outcome: 'DRAW';
} {
  const row1 = byUser.get(player1Id);
  const row2 = byUser.get(player2Id);
  if (row1) row1.rankedMatchesPlayed += 1;
  if (row2) row2.rankedMatchesPlayed += 1;
  notify();

  return {
    matchId,
    winnerId: player1Id,
    loserId: player2Id,
    winnerTier: row1?.tier ?? 'BRONZE',
    winnerTierWins: row1?.tierWinsTowardNext ?? 0,
    promoted: false,
    newTier: null,
    isDraw: true,
    outcome: 'DRAW',
  };
}

export function localCompleteRankedMatch(
  matchId: string,
  winnerId: DemoUserId,
  loserId: DemoUserId,
): {
  matchId: string;
  winnerId: string;
  loserId: string;
  winnerTier: Tier;
  winnerTierWins: number;
  promoted: boolean;
  newTier: Tier | null;
  isDraw: boolean;
  outcome: null;
} {
  const row = byUser.get(winnerId);
  if (!row) {
  return {
    matchId,
    winnerId,
    loserId,
    winnerTier: 'BRONZE',
    winnerTierWins: 0,
    promoted: false,
    newTier: null,
    isDraw: false,
    outcome: null,
    };
  }

  const currentTier = row.tier;
  let tierWins = row.tierWinsTowardNext + 1;
  let promoted = false;
  let newTier: Tier | null = null;

  const threshold = WINS_TO_ADVANCE[currentTier];
  if (threshold !== null && tierWins >= threshold) {
    const upcoming = nextTier(currentTier);
    if (upcoming) {
      promoted = true;
      newTier = upcoming;
      row.tier = upcoming;
      tierWins = 0;
    }
  }

  row.tierWinsTowardNext = tierWins;
  row.rankedMatchesPlayed += 1;

  const loserRow = byUser.get(loserId);
  if (loserRow) {
    loserRow.rankedMatchesPlayed += 1;
  }

  notify();

  return {
    matchId,
    winnerId,
    loserId,
    winnerTier: row.tier,
    winnerTierWins: tierWins,
    promoted,
    newTier,
    isDraw: false,
    outcome: null,
  };
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
  byUser.set('alice', buildSeedRow('alice', {
    tier: 'SILVER',
    tierWinsTowardNext: 4,
    equippedTitleId: 'sharpshooter',
    totalShots: 48,
    correctShots: 34,
    rankedMatchesPlayed: 43,
  }));
  byUser.set('bob', buildSeedRow('bob', {
    tier: 'GOLD',
    tierWinsTowardNext: 4,
    equippedTitleId: 'comeback-king',
    totalShots: 62,
    correctShots: 45,
    rankedMatchesPlayed: 15,
  }));
  notify();
}

export function subscribeLocalProfileChanged(onChange: () => void): () => void {
  return bus.on('changed', onChange);
}
