/**
 * Headless checks against the real PromptEngine (not a copy of its maths).
 *
 *   H2  a prompt still open at full time must lock and resolve
 *   H3  re-picking while Hot Take is armed must not spend another Hot Take
 *
 * Run with: npx tsx scripts/verify-prompt-engine.ts
 */

import { getMatchSim } from '../src/sim/matchSim';
import { getPromptEngine } from '../src/sim/promptEngine';
import { getRemainingHotTakes, initRankedHotTakeState } from '../src/sim/hotTakeStore';
import type { MatchClockState, MatchInfo, NormalizedEvent } from '../src/domain/types';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

let now = 1_000_000;
Date.now = () => now;

const sim = getMatchSim();
const engine = getPromptEngine();
engine.attach({ teams: { home: { id: 'H' }, guest: { id: 'G' } } } as unknown as MatchInfo);

function clock(matchMinute: number, phase: MatchClockState['phase'], isRunning = true): void {
  sim.bus.emit('clock', {
    matchMinute,
    displayClock: `${matchMinute}'`,
    phase,
    score: { home: 0, guest: 0 },
    isRunning,
  });
}

function freshRankedPrompt(minute: number) {
  engine.resetState();
  engine.setRankedScoring(true);
  initRankedHotTakeState('M', 'alice');
  now += 1_000_000;
  clock(minute, 'firstHalf');
  const prompt = engine.getActive();
  if (!prompt) throw new Error('no prompt opened');
  return prompt;
}

// ── H3: Hot Take accounting ────────────────────────────────────────────────
{
  const p = freshRankedPrompt(20);
  check('starts with 2 Hot Takes', getRemainingHotTakes('M', 'alice') === 2);
  engine.submitVote(p.id, 'alice', 'yes', { hotTake: true, matchId: 'M' });
  check('first hot vote spends one', getRemainingHotTakes('M', 'alice') === 1);
  engine.submitVote(p.id, 'alice', 'no', { hotTake: true, matchId: 'M' });
  check(
    're-pick while armed does not spend another',
    getRemainingHotTakes('M', 'alice') === 1,
    String(getRemainingHotTakes('M', 'alice')),
  );
  engine.submitVote(p.id, 'alice', 'yes', { hotTake: false, matchId: 'M' });
  check(
    're-pick without Hot Take refunds it',
    getRemainingHotTakes('M', 'alice') === 2,
    String(getRemainingHotTakes('M', 'alice')),
  );
}

// ── H2: prompt open at full time ──────────────────────────────────────────
{
  const p = freshRankedPrompt(80);
  engine.submitVote(p.id, 'alice', 'no');
  now += 20_000; // full time lands inside the 30 s window
  const ft = {
    id: 'ft',
    type: 'fullTime',
    matchMinute: 90,
    displayMinute: "90'",
    matchPhase: 'fullTime',
    eventTimeIso: '',
  } as NormalizedEvent;
  sim.bus.emit('event', ft);
  clock(90, 'fullTime');
  clock(90, 'fullTime', false); // sim.pause() after full time
  now += 600_000;
  clock(90, 'fullTime', false);
  const settled = engine.getActive();
  check('prompt open at FT is resolved', settled?.state === 'resolved', String(settled?.state));
  check(
    'correct pick is paid',
    engine.getUser('alice')?.matchPoints === 200,
    String(engine.getUser('alice')?.matchPoints),
  );
}

if (failed > 0) {
  console.error(`[verify-prompt-engine] ${failed} failed`);
  process.exit(1);
}
console.log('[verify-prompt-engine] All checks passed');
