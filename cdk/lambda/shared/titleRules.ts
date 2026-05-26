/**
 * Title unlock rules — keep in sync with `src/domain/titleRules.ts`.
 */

export const TITLE_THRESHOLDS = {
  sharpshooter: { minAccuracy: 0.7, minShots: 30 },
  sniper: { minAccuracy: 0.8, minShots: 50 },
  oracle: { minAccuracy: 0.9, minShots: 100 },
  analyst: { minRankedMatches: 100 },
  veteran: { minRankedMatches: 500 },
  comebackKing: { minHalftimeDeficit: 200 },
  perfectMatch: { minShotsInMatch: 6 },
} as const;

export interface TitleStats {
  totalShots: number;
  correctShots: number;
  rankedMatchesPlayed: number;
  unlockedTitles: string[];
}

export interface RankedMatchEndContext {
  shotsInMatch: number;
  correctInMatch: number;
  pointsAtHalfTime: number;
  opponentPointsAtHalfTime: number;
  wonMatch: boolean;
}

export function lifetimeAccuracyRatio(stats: TitleStats): number | null {
  if (stats.totalShots <= 0) return null;
  return stats.correctShots / stats.totalShots;
}

export type TitleUnlockScope = 'accuracy' | 'matchEnd' | 'all';

export function evaluateTitleUnlocks(
  stats: TitleStats,
  matchEnd?: RankedMatchEndContext,
  scope: TitleUnlockScope = 'all',
): string[] {
  const unlocked = new Set(stats.unlockedTitles);
  const next: string[] = [];
  const acc = lifetimeAccuracyRatio(stats);

  const tryUnlock = (id: string, ok: boolean) => {
    if (!ok || unlocked.has(id)) return;
    unlocked.add(id);
    next.push(id);
  };

  if (scope === 'accuracy' || scope === 'all') {
    const { sharpshooter, sniper, oracle, analyst, veteran } = TITLE_THRESHOLDS;
    if (acc !== null) {
      tryUnlock('sharpshooter', stats.totalShots >= sharpshooter.minShots && acc >= sharpshooter.minAccuracy);
      tryUnlock('sniper', stats.totalShots >= sniper.minShots && acc >= sniper.minAccuracy);
      tryUnlock('oracle', stats.totalShots >= oracle.minShots && acc >= oracle.minAccuracy);
    }
    tryUnlock('analyst', stats.rankedMatchesPlayed >= analyst.minRankedMatches);
    tryUnlock('veteran', stats.rankedMatchesPlayed >= veteran.minRankedMatches);
  }

  if ((scope === 'matchEnd' || scope === 'all') && matchEnd) {
    const { comebackKing, perfectMatch } = TITLE_THRESHOLDS;
    const { shotsInMatch, correctInMatch, pointsAtHalfTime, opponentPointsAtHalfTime, wonMatch } =
      matchEnd;
    tryUnlock(
      'comeback-king',
      wonMatch &&
        opponentPointsAtHalfTime - pointsAtHalfTime >= comebackKing.minHalftimeDeficit,
    );
    tryUnlock(
      'perfect-match',
      shotsInMatch >= perfectMatch.minShotsInMatch &&
        correctInMatch === shotsInMatch &&
        shotsInMatch > 0,
    );
  }

  return next;
}
