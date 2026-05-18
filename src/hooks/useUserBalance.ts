/**
 * useUserBalance — subscribes to a user's PitchCoin balance + streak.
 * Re-renders on every userBalanceChanged / userStreakChanged event from the
 * engine, so CoinBalance can animate the +N tick and (Gate 3) ProfilePill
 * can show the streak chip.
 */

import { useEffect, useState } from 'react';
import { getPromptEngine } from '../sim/promptEngine';

export interface UserBalanceState {
  balance: number;
  streak: number;
}

export function useUserBalance(userId: string): UserBalanceState {
  const engine = getPromptEngine();
  const [state, setState] = useState<UserBalanceState>(() => {
    const u = engine.getUser(userId);
    return { balance: u?.coinBalance ?? 0, streak: u?.streak ?? 0 };
  });

  useEffect(() => {
    const offs = [
      engine.bus.on('userBalanceChanged', (p) => {
        if (p.userId !== userId) return;
        setState((s) => ({ ...s, balance: p.balance }));
      }),
      engine.bus.on('userStreakChanged', (p) => {
        if (p.userId !== userId) return;
        setState((s) => ({ ...s, streak: p.streak }));
      }),
      engine.bus.on('reset', () => setState({ balance: 0, streak: 0 })),
    ];
    return () => offs.forEach((off) => off());
  }, [engine, userId]);

  return state;
}
