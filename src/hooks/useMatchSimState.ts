/**
 * useMatchSimState — subscribes a React component to the MatchSim singleton's
 * clock + event stream and returns the current state for rendering.
 *
 * Two phones on the same page = two components calling this hook against the
 * same singleton = both rendered from identical state. Gate 1's "<200ms parity"
 * guarantee is structurally enforced here.
 */

import { useEffect, useState } from 'react';
import { getMatchSim } from '../sim/matchSim';
import type { MatchClockState, NormalizedEvent } from '../domain/types';

export interface MatchSimState {
  clock: MatchClockState;
  events: NormalizedEvent[];
}

const EMPTY_CLOCK: MatchClockState = {
  matchMinute: 0,
  displayClock: "0'",
  phase: 'preMatch',
  score: { home: 0, guest: 0 },
  isRunning: false,
};

export function useMatchSimState(): MatchSimState {
  const sim = getMatchSim();
  const [clock, setClock] = useState<MatchClockState>(() => sim.getState() ?? EMPTY_CLOCK);
  const [events, setEvents] = useState<NormalizedEvent[]>([]);

  useEffect(() => {
    const offClock = sim.bus.on('clock', (c) => setClock(c));
    const offEvent = sim.bus.on('event', (e) => {
      setEvents((prev) => {
        // Guard against duplicates if reset() is followed by a replay.
        if (prev.length && prev[prev.length - 1].id === e.id) return prev;
        return [...prev, e];
      });
    });
    // Also reset our local list when the sim is reset.
    const offReady = sim.bus.on('ready', () => setEvents([]));
    return () => {
      offClock();
      offEvent();
      offReady();
    };
  }, [sim]);

  return { clock, events };
}
