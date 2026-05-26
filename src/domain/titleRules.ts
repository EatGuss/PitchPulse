/**
 * Title unlock thresholds — canonical spec (Ranked matches only for volume/accuracy).
 *
 * Accuracy (lifetime % across all Ranked matches):
 *   Sharpshooter — 70%+ lifetime accuracy, min 30 shots
 *   Sniper       — 80%+ lifetime accuracy, min 50 shots
 *   Oracle       — 90%+ lifetime accuracy, min 100 shots
 *
 * Volume (lifetime ranked matches played):
 *   Analyst — 100+ ranked matches
 *   Veteran — 500+ ranked matches
 *
 * Style (single-match; earned once, kept lifetime):
 *   Hot Take Hero  — won ≥1 hot take in any ranked match
 *   Comeback King  — won ranked after trailing 200+ points at halftime
 *   Perfect Match  — 100% accuracy in one ranked match, min 6 shots that match
 */

import { TITLE_CATALOG, titleDisplayName } from './titles';

/** Single source of truth — mirror in `cdk/lambda/shared/titleRules.ts`. */
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
  unlockedTitleIds: string[];
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

/** Title IDs newly earned (not already unlocked). Hot Take Hero is unlocked via `unlockHotTakeHero`. */
export function evaluateTitleUnlocks(
  stats: TitleStats,
  matchEnd?: RankedMatchEndContext,
  scope: TitleUnlockScope = 'all',
): string[] {
  const unlocked = new Set(stats.unlockedTitleIds);
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

export function titleProgressLabel(titleId: string, stats: TitleStats): string {
  if (stats.unlockedTitleIds.includes(titleId)) {
    return titleById(titleId)?.hint ?? 'Unlocked';
  }

  const acc = lifetimeAccuracyRatio(stats);
  const pct = acc !== null ? `${Math.round(acc * 100)}%` : '—';

  switch (titleId) {
    case 'sharpshooter':
      return `${pct} lifetime · ${stats.totalShots}/${TITLE_THRESHOLDS.sharpshooter.minShots} shots (need 70%+)`;
    case 'sniper':
      return `${pct} lifetime · ${stats.totalShots}/${TITLE_THRESHOLDS.sniper.minShots} shots (need 80%+)`;
    case 'oracle':
      return `${pct} lifetime · ${stats.totalShots}/${TITLE_THRESHOLDS.oracle.minShots} shots (need 90%+)`;
    case 'analyst':
      return `${stats.rankedMatchesPlayed}/${TITLE_THRESHOLDS.analyst.minRankedMatches} ranked matches`;
    case 'veteran':
      return `${stats.rankedMatchesPlayed}/${TITLE_THRESHOLDS.veteran.minRankedMatches} ranked matches`;
    case 'hot-take-hero':
      return 'Win a hot take in any ranked match';
    case 'comeback-king':
      return `Win ranked after trailing ${TITLE_THRESHOLDS.comebackKing.minHalftimeDeficit}+ pts at HT`;
    case 'perfect-match':
      return `100% in one ranked match · min ${TITLE_THRESHOLDS.perfectMatch.minShotsInMatch} shots`;
    default:
      return 'Locked';
  }
}

function titleById(id: string) {
  return TITLE_CATALOG.find((t) => t.id === id);
}

export function titleUnlockLabel(titleId: string): string {
  return `Title unlocked: ${titleDisplayName(titleId)}`;
}

/** Title IDs earned from lifetime accuracy + volume stats (excludes style titles). */
export function titlesEarnedByLifetimeStats(
  stats: Pick<TitleStats, 'totalShots' | 'correctShots' | 'rankedMatchesPlayed'>,
): string[] {
  return evaluateTitleUnlocks(
    { ...stats, unlockedTitleIds: [] },
    undefined,
    'accuracy',
  );
}

/** Drop volume/accuracy titles that no longer meet thresholds (stale AWS seed safety). */
export function filterValidUnlockedTitleIds(
  stats: TitleStats,
  unlockedTitleIds: string[],
): string[] {
  const acc = lifetimeAccuracyRatio(stats);
  return unlockedTitleIds.filter((id) => {
    switch (id) {
      case 'sharpshooter':
        return stats.totalShots >= TITLE_THRESHOLDS.sharpshooter.minShots && acc !== null && acc >= TITLE_THRESHOLDS.sharpshooter.minAccuracy;
      case 'sniper':
        return stats.totalShots >= TITLE_THRESHOLDS.sniper.minShots && acc !== null && acc >= TITLE_THRESHOLDS.sniper.minAccuracy;
      case 'oracle':
        return stats.totalShots >= TITLE_THRESHOLDS.oracle.minShots && acc !== null && acc >= TITLE_THRESHOLDS.oracle.minAccuracy;
      case 'analyst':
        return stats.rankedMatchesPlayed >= TITLE_THRESHOLDS.analyst.minRankedMatches;
      case 'veteran':
        return stats.rankedMatchesPlayed >= TITLE_THRESHOLDS.veteran.minRankedMatches;
      default:
        return true;
    }
  });
}
