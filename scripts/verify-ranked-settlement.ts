/**
 * Headless check: both /demo phone frames call commitCompleteRankedMatch at
 * full time. The second call must reuse the first result and must not apply
 * tier wins or matches-played a second time.
 *
 * Run with: npx tsx scripts/verify-ranked-settlement.ts
 */

import { commitCompleteRankedMatch, resetRankedSettlements } from '../src/aws/rankedMatchClient';
import { localGetMeProfile, localGetTierProgress } from '../src/sim/localProfileStore';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

const before = localGetMeProfile('alice', 0, 0).rankedMatchesPlayed;
const winsBefore = localGetTierProgress('alice').winsTowardNext;

// Alice (Silver 4/5) beats Bob; both phones settle.
const [first, second] = await Promise.all([
  commitCompleteRankedMatch('M1', 'alice', 'bob', 500, 300),
  commitCompleteRankedMatch('M1', 'alice', 'bob', 500, 300),
]);

check('both callers get the same result', first === second || JSON.stringify(first) === JSON.stringify(second));
check('Alice promoted exactly once', first.promoted && first.newTier === 'GOLD');
check('Alice tier wins reset to 0, not 1', localGetTierProgress('alice').winsTowardNext === 0 && winsBefore === 4);
check(
  'matches played incremented once',
  localGetMeProfile('alice', 0, 0).rankedMatchesPlayed === before + 1,
  String(localGetMeProfile('alice', 0, 0).rankedMatchesPlayed),
);

// Draw reported from either side is the same settlement.
const d1 = commitCompleteRankedMatch('M2', 'alice', 'bob', 100, 100);
const d2 = commitCompleteRankedMatch('M2', 'bob', 'alice', 100, 100);
check('draw from either phone dedupes', d1 === d2);

resetRankedSettlements();
const again = await commitCompleteRankedMatch('M1', 'alice', 'bob', 500, 300);
check('after reset a new settlement is allowed', again !== first);

if (failed > 0) {
  console.error(`[verify-ranked-settlement] ${failed} failed`);
  process.exit(1);
}
console.log('[verify-ranked-settlement] All checks passed');
