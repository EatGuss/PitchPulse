import type { DemoUserId } from '../data/personas';
import { getUserRankedMatchStats } from '../sim/rankedMatchStats';

export interface RankedMatchTitleInput {
  winnerShotsInMatch: number;
  winnerCorrectInMatch: number;
  loserShotsInMatch: number;
  loserCorrectInMatch: number;
  winnerPointsAtHalfTime: number;
  loserPointsAtHalfTime: number;
}

export function buildRankedMatchTitleInput(
  winnerId: DemoUserId,
  loserId: DemoUserId,
): RankedMatchTitleInput {
  const winner = getUserRankedMatchStats(winnerId);
  const loser = getUserRankedMatchStats(loserId);
  return {
    winnerShotsInMatch: winner.shotsInMatch,
    winnerCorrectInMatch: winner.correctInMatch,
    loserShotsInMatch: loser.shotsInMatch,
    loserCorrectInMatch: loser.correctInMatch,
    winnerPointsAtHalfTime: winner.pointsAtHalfTime,
    loserPointsAtHalfTime: loser.pointsAtHalfTime,
  };
}
