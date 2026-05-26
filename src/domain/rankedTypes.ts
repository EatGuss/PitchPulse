import type { Tier } from './tiers';

export interface RankedOpponent {
  opponentId: string;
  opponentName: string;
  opponentTier: Tier;
  opponentTitle: string | null;
}

export type RankedMatchOutcome = 'DRAW';

export type UserRankedOutcome = 'WIN' | 'LOSE' | 'DRAW';

export interface RankedMatchResult {
  matchId: string;
  winnerId: string;
  loserId: string;
  winnerTier: Tier;
  winnerTierWins: number;
  promoted: boolean;
  newTier: Tier | null;
  isDraw: boolean;
  outcome: RankedMatchOutcome | null;
}

/** Per-user outcome for outcome screens (Gate C). */
export function resolveUserRankedOutcome(
  userId: string,
  result: RankedMatchResult | null,
  userPoints: number,
  opponentPoints: number,
): UserRankedOutcome {
  if (result?.isDraw || result?.outcome === 'DRAW' || userPoints === opponentPoints) {
    return 'DRAW';
  }
  if (result) {
    return userId === result.winnerId ? 'WIN' : 'LOSE';
  }
  if (userPoints > opponentPoints) return 'WIN';
  if (userPoints < opponentPoints) return 'LOSE';
  return 'DRAW';
}
