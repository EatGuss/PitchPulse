/**
 * useMatchPoints — subscribes to a user's match-local PitchPoints + streak.
 * Re-renders on userMatchPointsChanged / userStreakChanged events from the engine.
 */

import { useEffect, useState } from 'react';
import { getPromptEngine } from '../sim/promptEngine';

export interface MatchPointsState {
  matchPoints: number;
  streak: number;
}

export function useMatchPoints(userId: string): MatchPointsState {
  const engine = getPromptEngine();
  const [state, setState] = useState<MatchPointsState>(() => {
    const u = engine.getUser(userId);
    return { matchPoints: u?.matchPoints ?? 0, streak: u?.streak ?? 0 };
  });

  useEffect(() => {
    const offs = [
      engine.bus.on('userMatchPointsChanged', (p) => {
        if (p.userId !== userId) return;
        setState((s) => ({ ...s, matchPoints: p.matchPoints }));
      }),
      engine.bus.on('userStreakChanged', (p) => {
        if (p.userId !== userId) return;
        setState((s) => ({ ...s, streak: p.streak }));
      }),
      engine.bus.on('reset', () => setState({ matchPoints: 0, streak: 0 })),
    ];
    return () => offs.forEach((off) => off());
  }, [engine, userId]);

  return state;
}
