/**
 * Headless verification of the PitchPoints payout formula.
 *
 * Run with: npx tsx scripts/verify-payouts.ts
 *
 * Spec (PITCHPULSE.md §6.3, brief Pillar 3):
 *   payout = baseReward × min(1 / your_vote_share, 5)
 *   Wrong = 0 points, never negative.
 *
 * This is the pure-math sibling of PromptEngine.computePayouts(). If you
 * change the formula in the engine, mirror it here AND update these cases.
 */

const MAX_MULT = 5;

interface Vote { user: string; option: string }

function payouts(
  baseReward: number,
  votes: Vote[],
  winningOption: string,
): Record<string, number> {
  const total = votes.length;
  const winners = votes.filter((v) => v.option === winningOption).length;
  if (total === 0 || winners === 0) return {};
  const share = winners / total;
  const reward = Math.round(baseReward * Math.min(1 / share, MAX_MULT));
  return Object.fromEntries(
    votes.map((v) => [v.user, v.option === winningOption ? reward : 0]),
  );
}

interface Case { name: string; base: number; votes: Vote[]; winner: string; expect: Record<string, number> }

const cases: Case[] = [
  {
    name: '1 of 2 correct (50/50 split): 2× multiplier',
    base: 200,
    votes: [
      { user: 'alice', option: 'yes' },
      { user: 'bob',   option: 'no'  },
    ],
    winner: 'yes',
    // share = 1/2 = 0.5 → 1/share = 2 → reward = 200 × 2 = 400
    expect: { alice: 400, bob: 0 },
  },
  {
    name: 'both right (1.0 share): 1× multiplier — no minority bonus',
    base: 200,
    votes: [
      { user: 'alice', option: 'yes' },
      { user: 'bob',   option: 'yes' },
    ],
    winner: 'yes',
    expect: { alice: 200, bob: 200 },
  },
  {
    name: 'both wrong: nobody earns, nobody loses',
    base: 200,
    votes: [
      { user: 'alice', option: 'no' },
      { user: 'bob',   option: 'no' },
    ],
    winner: 'yes',
    expect: {},
  },
  {
    name: 'no votes: nobody earns',
    base: 200,
    votes: [],
    winner: 'yes',
    expect: {},
  },
  {
    name: 'lone correct out of 10 (share 0.1 → multiplier capped at 5)',
    base: 100,
    votes: Array.from({ length: 10 }, (_, i) => ({
      user: `u${i}`,
      option: i === 0 ? 'yes' : 'no',
    })),
    winner: 'yes',
    // share = 0.1 → 1/share = 10 → capped to 5 → 100 × 5 = 500
    expect: {
      u0: 500,
      ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`u${i + 1}`, 0])),
    },
  },
  {
    name: 'rounding: 250 × min(1/0.4, 5) = 250 × 2.5 = 625',
    base: 250,
    votes: [
      { user: 'a', option: 'x' },
      { user: 'b', option: 'x' },
      { user: 'c', option: 'y' },
      { user: 'd', option: 'y' },
      { user: 'e', option: 'y' },
    ],
    winner: 'x',
    expect: { a: 625, b: 625, c: 0, d: 0, e: 0 },
  },
  {
    name: 'never negative even when base is small',
    base: 1,
    votes: [
      { user: 'a', option: 'no'  },
      { user: 'b', option: 'yes' },
      { user: 'c', option: 'yes' },
    ],
    winner: 'no',
    // share = 1/3 → 1/share = 3 → reward = 1 × 3 = 3
    expect: { a: 3, b: 0, c: 0 },
  },
];

let passed = 0;
let failed = 0;

for (const c of cases) {
  const actual = payouts(c.base, c.votes, c.winner);
  const ok = JSON.stringify(actual) === JSON.stringify(c.expect);
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${c.name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${c.name}`);
    console.log(`        expected: ${JSON.stringify(c.expect)}`);
    console.log(`        actual:   ${JSON.stringify(actual)}`);
  }
  // Also assert "never negative" universally.
  for (const v of Object.values(actual)) {
    if (v < 0) {
      console.log(`  FAIL  ${c.name} — produced NEGATIVE payout ${v}`);
      failed += 1;
    }
  }
}

console.log('');
console.log(`[verify-payouts] ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
