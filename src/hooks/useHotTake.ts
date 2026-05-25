/**
 * useHotTake — ranked Hot Take state: remaining uses, toggle, rival signals.
 */

import { useCallback, useEffect, useState } from 'react';
import { MATCH_ID } from '../aws/config';
import {
  getRemainingHotTakes,
  subscribeHotTakeChanged,
  type HotTakeSignal,
} from '../sim/hotTakeStore';
import { subscribeRivalHotTake, syncSignalHotTake, syncSubmitVote } from '../aws/hotTakeClient';
import { getPromptEngine } from '../sim/promptEngine';
import { commitUnlockHotTakeHero } from '../aws/profileClient';
import type { DemoUserId } from '../data/personas';

export interface UseHotTakeOptions {
  enabled: boolean;
  userId: DemoUserId;
  rivalUserId?: string;
}

export interface UseHotTakeResult {
  remaining: number;
  hotTakeOn: boolean;
  setHotTakeOn: (on: boolean) => void;
  rivalHotTakePromptId: string | null;
  /** Submit vote with optional hot take + AWS sync. */
  vote: (promptId: string, optionId: string) => boolean;
}

export function useHotTake({ enabled, userId, rivalUserId }: UseHotTakeOptions): UseHotTakeResult {
  const [remaining, setRemaining] = useState(() =>
    enabled ? getRemainingHotTakes(MATCH_ID, userId) : 0,
  );
  const [hotTakeOn, setHotTakeOn] = useState(false);
  const [rivalHotTakePromptId, setRivalHotTakePromptId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRemaining(0);
      setHotTakeOn(false);
      setRivalHotTakePromptId(null);
      return;
    }
    setRemaining(getRemainingHotTakes(MATCH_ID, userId));
    return subscribeHotTakeChanged(() => {
      setRemaining(getRemainingHotTakes(MATCH_ID, userId));
    });
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled || !rivalUserId) return;
    return subscribeRivalHotTake(rivalUserId, (signal: HotTakeSignal) => {
      setRivalHotTakePromptId(signal.promptId);
    });
  }, [enabled, rivalUserId]);

  useEffect(() => {
    if (!enabled) return;
    const engine = getPromptEngine();
    const offWon = engine.bus.on('hotTakeWon', ({ userId: winnerId }) => {
      if (winnerId !== userId) return;
      void commitUnlockHotTakeHero(userId);
    });
    return offWon;
  }, [enabled, userId]);

  const vote = useCallback(
    (promptId: string, optionId: string): boolean => {
      if (!enabled) return false;
      const useHotTake = hotTakeOn && remaining > 0;
      const engine = getPromptEngine();
      const ok = engine.submitVote(promptId, userId, optionId, {
        hotTake: useHotTake,
        matchId: MATCH_ID,
      });
      if (!ok) return false;

      void syncSubmitVote(promptId, userId, optionId, useHotTake, true);
      if (useHotTake && rivalUserId) {
        void syncSignalHotTake(promptId, userId, rivalUserId);
      }

      setHotTakeOn(false);
      return true;
    },
    [enabled, hotTakeOn, remaining, rivalUserId, userId],
  );

  return { remaining, hotTakeOn, setHotTakeOn, rivalHotTakePromptId, vote };
}
