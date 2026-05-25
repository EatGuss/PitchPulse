import type { Tier } from './tiers';

export interface RankedOpponent {
  opponentId: string;
  opponentName: string;
  opponentTier: Tier;
  opponentTitle: string | null;
}
