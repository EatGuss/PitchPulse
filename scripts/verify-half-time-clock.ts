/**
 * Verifies 1H stoppage → HT → 46' 2H ordering for the local MatchSim drain rules.
 * Run: npx tsx scripts/verify-half-time-clock.ts
 */

import { readFileSync } from 'node:fs';

const SECOND_HALF_START_MINUTE = 46;

interface Ev {
  type: string;
  matchMinute: number;
  displayMinute: string;
  matchPhase: string;
  kickOffRole?: string;
}

const events = (JSON.parse(readFileSync('public/events.json', 'utf-8')) as { events: Ev[] })
  .events;

let cursor = 0;
let halfTimeEmitted = false;
let secondHalfStarted = false;
let inHalfTimeBreak = false;
const delivered: string[] = [];
const clocks: string[] = [];

function shouldDefer(ev: Ev): boolean {
  if (secondHalfStarted) {
    return (
      ev.matchPhase === 'firstHalf' ||
      ev.type === 'halfTime' ||
      ev.matchPhase === 'halfTime'
    );
  }
  if (ev.matchPhase === 'secondHalf' || ev.kickOffRole === 'secondHalfStart') return true;
  if (halfTimeEmitted && ev.matchPhase === 'firstHalf') return true;
  return false;
}

function drain(mm: number): void {
  while (cursor < events.length) {
    const ev = events[cursor];
    if (ev.matchMinute > mm) break;
    if (shouldDefer(ev)) break;
    cursor += 1;
    delivered.push(`${ev.displayMinute}:${ev.type}`);
    if (ev.matchPhase === 'firstHalf' && ev.matchMinute >= 45) {
      clocks.push(ev.displayMinute);
    }
    if (ev.type === 'halfTime') {
      halfTimeEmitted = true;
      inHalfTimeBreak = true;
      clocks.push('HT');
    }
  }
}

const htIdx = events.findIndex((e) => e.type === 'halfTime');
const ko2Idx = events.findIndex((e) => e.kickOffRole === 'secondHalfStart');
const htMin = events[htIdx]?.matchMinute ?? 45.03;

for (const mm of [44, 45, 45.01, 45.02, 45.03]) {
  drain(Math.min(mm, htMin));
}

if (!inHalfTimeBreak) throw new Error('expected HT break after whistle');

inHalfTimeBreak = false;
secondHalfStarted = true;
drain(SECOND_HALF_START_MINUTE);
drain(55);

const stoppageClocks = clocks.filter((c) => c.startsWith('45'));
const errors: string[] = [];

if (!stoppageClocks.includes("45'")) errors.push('missing 45\'');
if (!stoppageClocks.includes("45+1'")) errors.push('missing 45+1\'');
if (!stoppageClocks.includes("45+2'")) errors.push('missing 45+2\'');
if (stoppageClocks.includes("46'")) errors.push('46\' shown during 1H stoppage');
if (!clocks.includes('HT')) errors.push('missing HT');
if (!delivered.some((d) => d.endsWith(':kickOff') && d.startsWith("46'"))) {
  errors.push('missing 46\' kick-off');
}
const secondHalfCards = delivered.filter((d) => {
  const min = Number(d.split(':')[0].replace(/[^\d.]/g, '') || '0');
  return min >= SECOND_HALF_START_MINUTE && !d.includes('halfTime');
});
if (secondHalfCards.length < 2) errors.push('too few 2H event cards');

if (cursor <= ko2Idx) errors.push(`cursor stuck before 2H (cursor=${cursor}, ko2=${ko2Idx})`);

if (errors.length) {
  console.error('[verify-half-time-clock] FAIL');
  errors.forEach((e) => console.error(' -', e));
  console.error('clocks', clocks);
  console.error('delivered tail', delivered.slice(-8));
  process.exit(1);
}

console.log('[verify-half-time-clock] OK');
console.log('  stoppage clocks:', stoppageClocks.join(' → '), '→ HT → 46\'');
console.log('  2H cards emitted:', secondHalfCards.length);
