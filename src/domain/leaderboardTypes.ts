import type { Tier } from './tiers';

export type StandingsPeriod = 'weekly' | 'seasonal';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  equippedTitle: string | null;
  tier: Tier;
  points: number;
}

export interface UserStats {
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
  unlockedTitleIds: string[];
  tierWinsTowardNext: number;
  lifetimeAccuracy: number | null;
  rankedMatchesPlayed: number;
}
