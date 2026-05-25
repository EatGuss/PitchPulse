/**
 * Demo matchday kickoff anchor — set when the replay sim leaves preMatch.
 */

import type { MatchSim } from './matchSim';

let simKickoffWallMs: number | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function getSimKickoffWallMs(): number | null {
  return simKickoffWallMs;
}

export function subscribeMatchdaySchedule(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function bindMatchdaySchedule(sim: MatchSim): void {
  sim.bus.on('clock', (clock) => {
    if (simKickoffWallMs === null && clock.phase !== 'preMatch') {
      simKickoffWallMs = Date.now();
      notify();
    }
  });
  sim.bus.on('reset', () => {
    simKickoffWallMs = null;
    notify();
  });
}
