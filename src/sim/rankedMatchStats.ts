/**
 * Collect per-user ranked match stats from PromptEngine for title evaluation.
 */

import type { DemoUserId } from '../data/personas';
import { getPromptEngine } from './promptEngine';
import { getHalfTimePointsSnapshot } from './titleUnlockEngine';

export interface UserRankedMatchStats {
  shotsInMatch: number;
  correctInMatch: number;
  pointsAtHalfTime: number;
}

export function getUserRankedMatchStats(userId: DemoUserId): UserRankedMatchStats {
  const user = getPromptEngine().getUser(userId);
  const ht = getHalfTimePointsSnapshot();
  return {
    shotsInMatch: user?.totalVoted ?? 0,
    correctInMatch: user?.totalCorrect ?? 0,
    pointsAtHalfTime: ht[userId] ?? user?.matchPoints ?? 0,
  };
}
