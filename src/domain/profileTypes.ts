import type { Tier } from './tiers';

export type MatchHistoryResult = 'Win' | 'Loss' | 'Draw';

export interface MatchHistoryEntry {
  id: string;
  playedAt: string;
  mode: 'Ranked' | 'Watch Room';
  opponent: string;
  points: number;
  result: MatchHistoryResult;
  fixtureLabel: string;
}

export interface MeProfile {
  userId: string;
  tier: Tier;
  tierWinsTowardNext: number;
  equippedTitleId: string | null;
  equippedTitle: string | null;
  unlockedTitleIds: string[];
  weeklyPoints: number;
  seasonalPoints: number;
  lifetimeAccuracy: number | null;
  totalShots: number;
  correctShots: number;
  rankedMatchesPlayed: number;
  matchHistory: MatchHistoryEntry[];
}
