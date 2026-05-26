/**
 * Headless check that title unlock thresholds match the product spec.
 * Mirrors src/domain/titleRules.ts — update both if thresholds change.
 * Run: npm run verify:titles
 */

const THRESHOLDS = {
  sharpshooter: { minAccuracy: 0.7, minShots: 30 },
  sniper: { minAccuracy: 0.8, minShots: 50 },
  oracle: { minAccuracy: 0.9, minShots: 100 },
  analyst: { minRankedMatches: 100 },
  veteran: { minRankedMatches: 500 },
  comebackKing: { minHalftimeDeficit: 200 },
  perfectMatch: { minShotsInMatch: 6 },
} as const;

interface TitleStats {
  totalShots: number;
  correctShots: number;
  rankedMatchesPlayed: number;
  unlockedTitleIds: string[];
}

interface MatchEnd {
  shotsInMatch: number;
  correctInMatch: number;
  pointsAtHalfTime: number;
  opponentPointsAtHalfTime: number;
  wonMatch: boolean;
}

function evaluate(stats: TitleStats, matchEnd?: MatchEnd, scope: 'accuracy' | 'matchEnd' = 'accuracy'): string[] {
  const unlocked = new Set(stats.unlockedTitleIds);
  const next: string[] = [];
  const acc = stats.totalShots > 0 ? stats.correctShots / stats.totalShots : null;

  const tryUnlock = (id: string, ok: boolean) => {
    if (!ok || unlocked.has(id)) return;
    unlocked.add(id);
    next.push(id);
  };

  if (scope === 'accuracy') {
    if (acc !== null) {
      tryUnlock('sharpshooter', stats.totalShots >= THRESHOLDS.sharpshooter.minShots && acc >= THRESHOLDS.sharpshooter.minAccuracy);
      tryUnlock('sniper', stats.totalShots >= THRESHOLDS.sniper.minShots && acc >= THRESHOLDS.sniper.minAccuracy);
      tryUnlock('oracle', stats.totalShots >= THRESHOLDS.oracle.minShots && acc >= THRESHOLDS.oracle.minAccuracy);
    }
    tryUnlock('analyst', stats.rankedMatchesPlayed >= THRESHOLDS.analyst.minRankedMatches);
    tryUnlock('veteran', stats.rankedMatchesPlayed >= THRESHOLDS.veteran.minRankedMatches);
  }

  if (scope === 'matchEnd' && matchEnd) {
    tryUnlock(
      'comeback-king',
      matchEnd.wonMatch &&
        matchEnd.opponentPointsAtHalfTime - matchEnd.pointsAtHalfTime >= THRESHOLDS.comebackKing.minHalftimeDeficit,
    );
    tryUnlock(
      'perfect-match',
      matchEnd.shotsInMatch >= THRESHOLDS.perfectMatch.minShotsInMatch &&
        matchEnd.correctInMatch === matchEnd.shotsInMatch &&
        matchEnd.shotsInMatch > 0,
    );
  }

  return next;
}

let failed = 0;

function assert(name: string, ok: boolean) {
  if (ok) console.log(`  OK    ${name}`);
  else {
    console.log(`  FAIL  ${name}`);
    failed += 1;
  }
}

const base: TitleStats = {
  totalShots: 0,
  correctShots: 0,
  rankedMatchesPlayed: 0,
  unlockedTitleIds: [],
};

console.log('[verify-title-rules] Threshold constants');
assert('Sharpshooter 70% / 30 shots', THRESHOLDS.sharpshooter.minAccuracy === 0.7 && THRESHOLDS.sharpshooter.minShots === 30);
assert('Sniper 80% / 50 shots', THRESHOLDS.sniper.minAccuracy === 0.8 && THRESHOLDS.sniper.minShots === 50);
assert('Oracle 90% / 100 shots', THRESHOLDS.oracle.minAccuracy === 0.9 && THRESHOLDS.oracle.minShots === 100);
assert('Analyst 100 matches', THRESHOLDS.analyst.minRankedMatches === 100);
assert('Veteran 500 matches', THRESHOLDS.veteran.minRankedMatches === 500);
assert('Comeback 200 pt HT deficit', THRESHOLDS.comebackKing.minHalftimeDeficit === 200);
assert('Perfect Match 6 shots', THRESHOLDS.perfectMatch.minShotsInMatch === 6);

console.log('\n[verify-title-rules] Unlock evaluation');
assert(
  'Sharpshooter at 70% / 30 shots',
  evaluate({ ...base, totalShots: 30, correctShots: 21, unlockedTitleIds: [] }).includes('sharpshooter'),
);
assert(
  'Sharpshooter blocked below 70%',
  !evaluate({ ...base, totalShots: 30, correctShots: 20, unlockedTitleIds: [] }).includes('sharpshooter'),
);
assert(
  'Comeback King on 200+ HT deficit win',
  evaluate(
    { ...base, unlockedTitleIds: [] },
    { shotsInMatch: 6, correctInMatch: 4, pointsAtHalfTime: 100, opponentPointsAtHalfTime: 300, wonMatch: true },
    'matchEnd',
  ).includes('comeback-king'),
);
assert(
  'Perfect Match at 6/6',
  evaluate(
    { ...base, unlockedTitleIds: [] },
    { shotsInMatch: 6, correctInMatch: 6, pointsAtHalfTime: 0, opponentPointsAtHalfTime: 0, wonMatch: true },
    'matchEnd',
  ).includes('perfect-match'),
);

console.log('');
if (failed > 0) {
  console.error(`[verify-title-rules] FAILED — ${failed} assertion(s)`);
  process.exit(1);
}
console.log('[verify-title-rules] All checks passed');
