/**
 * Match clock display — shared by parser, MatchSim, and AWS sim-emitter.
 */

import { SECOND_HALF_START_MINUTE, type MatchPhase } from '../domain/types';

export function formatDisplayClock(matchMinute: number, phase: MatchPhase): string {
  if (phase === 'halfTime') return 'HT';
  if (phase === 'fullTime') return 'FT';

  if (phase === 'firstHalf' && matchMinute >= 45) {
    const capped = Math.min(matchMinute, SECOND_HALF_START_MINUTE - 0.001);
    if (capped < 45 + 0.005) return "45'";
    const added = Math.ceil((capped - 45 - 0.004) / 0.01);
    return `45+${Math.max(1, added)}'`;
  }

  if (phase === 'secondHalf') {
    const minute = Math.floor(matchMinute);
    if (minute > 90) return `90+${minute - 90}'`;
    return `${Math.max(SECOND_HALF_START_MINUTE, minute)}'`;
  }

  return `${Math.floor(matchMinute)}'`;
}
