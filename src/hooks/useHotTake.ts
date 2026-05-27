/**
 * useHotTake — ranked Hot Take state: remaining uses, toggle, rival signals.
 * One Hot Take per prompt across both players (1v1 duel).
 */

import { useCallback, useEffect, useState } from 'react';
import { MATCH_ID } from '../aws/config';
import {
  claimPromptHotTake,
  getPromptHotTakeClaim,
  getRemainingHotTakes,
  releasePromptHotTake,
  subscribeHotTakeChanged,
  subscribePromptHotTakeClaim,
  subscribePromptHotTakeClaimReleased,
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

function syncRivalClaim(
  promptId: string | undefined,
  rivalUserId: string | undefined,
): string | null {
  if (!promptId || !rivalUserId) return null;
  const holder = getPromptHotTakeClaim(MATCH_ID, promptId);
  return holder === rivalUserId ? promptId : null;
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

  // Keep toggle UI aligned with the shared prompt engine (both phones share one active prompt).
  useEffect(() => {
    if (!enabled) return;
    const engine = getPromptEngine();
    const resetForNewPrompt = () => {
      setHotTakeOn(false);
      setRivalHotTakePromptId(null);
    };
    const syncFromEngine = () => {
      const active = engine.getActive();
      if (!active || active.state !== 'open') return;
      setRivalHotTakePromptId(syncRivalClaim(active.id, rivalUserId));
      const claimed = getPromptHotTakeClaim(MATCH_ID, active.id) === userId;
      if (!(userId in active.userVotes)) {
        setHotTakeOn(claimed);
        return;
      }
      setHotTakeOn(active.userHotTakes?.[userId] === true || claimed);
    };
    const offs = [
      engine.bus.on('promptOpened', resetForNewPrompt),
      engine.bus.on('promptUpdated', syncFromEngine),
      engine.bus.on('promptClosed', syncFromEngine),
      engine.bus.on('reset', resetForNewPrompt),
    ];
    return () => offs.forEach((off) => off());
  }, [enabled, rivalUserId, userId]);

  useEffect(() => {
    if (!enabled) return;
    const onClaim = ({
      matchId,
      promptId,
      userId: claimerId,
    }: {
      matchId: string;
      promptId: string;
      userId: string;
    }) => {
      if (matchId !== MATCH_ID) return;
      // Own claim → immediately reflect armed state in the toggle. This is
      // the authoritative signal: even if applyHotTakeToggle bailed early
      // (e.g. mid-prompt-poll snapshot race), the claim store has the truth.
      if (claimerId === userId) {
        setHotTakeOn(true);
        return;
      }
      if (rivalUserId && claimerId !== rivalUserId) return;
      setRivalHotTakePromptId(promptId);
      setHotTakeOn(false);
    };
    const onRelease = ({ matchId, promptId }: { matchId: string; promptId: string }) => {
      if (matchId !== MATCH_ID) return;
      setRivalHotTakePromptId((cur) => (cur === promptId ? null : cur));
      // If WE released our own claim (e.g. toggle off pre-vote), drop the
      // armed flag too. Safe: the store guarantees only the holder can release.
      if (getPromptHotTakeClaim(MATCH_ID, promptId) === null) {
        setHotTakeOn(false);
      }
    };
    const offs = [
      subscribePromptHotTakeClaim(onClaim),
      subscribePromptHotTakeClaimReleased(onRelease),
    ];
    return () => offs.forEach((off) => off());
  }, [enabled, rivalUserId, userId]);

  useEffect(() => {
    if (!enabled || !rivalUserId) return;
    return subscribeRivalHotTake(rivalUserId, (signal: HotTakeSignal) => {
      setRivalHotTakePromptId(signal.promptId);
      setHotTakeOn(false);
    });
  }, [enabled, rivalUserId]);

  useEffect(() => {
    if (!enabled) return;
    const engine = getPromptEngine();
    const clearRival = () => setRivalHotTakePromptId(null);
    const offs = [
      engine.bus.on('promptOpened', clearRival),
      engine.bus.on('promptResolved', clearRival),
      engine.bus.on('reset', clearRival),
    ];
    return () => offs.forEach((off) => off());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const engine = getPromptEngine();
    const offWon = engine.bus.on('hotTakeWon', ({ userId: winnerId }) => {
      if (winnerId !== userId) return;
      void commitUnlockHotTakeHero(userId);
    });
    return offWon;
  }, [enabled, userId]);

  const applyHotTakeToggle = useCallback(
    (on: boolean) => {
      if (!enabled) return;

      const engine = getPromptEngine();
      const active = engine.getActive();
      if (!active || active.state !== 'open') return;

      if (on) {
        const holder = getPromptHotTakeClaim(MATCH_ID, active.id);
        if (holder && holder !== userId) {
          setHotTakeOn(false);
          return;
        }
      }

      // Arm before vote: claim prompt so rival cannot also go Hot Take.
      if (!(userId in active.userVotes)) {
        if (on) {
          if (!claimPromptHotTake(MATCH_ID, active.id, userId)) {
            setHotTakeOn(false);
            return;
          }
          setHotTakeOn(true);
          if (rivalUserId) void syncSignalHotTake(active.id, userId, rivalUserId);
        } else {
          releasePromptHotTake(MATCH_ID, active.id, userId);
          setHotTakeOn(false);
        }
        return;
      }

      const ok = engine.setVoteHotTake(active.id, userId, on, MATCH_ID);
      if (!ok) {
        setHotTakeOn(active.userHotTakes?.[userId] === true);
        return;
      }

      setHotTakeOn(active.userHotTakes?.[userId] === true);
      void syncSubmitVote(active.id, userId, active.userVotes[userId]!, on, true);
      if (on && rivalUserId) {
        void syncSignalHotTake(active.id, userId, rivalUserId);
      }
    },
    [enabled, rivalUserId, userId],
  );

  const vote = useCallback(
    (promptId: string, optionId: string): boolean => {
      if (!enabled) return false;
      const armed =
        hotTakeOn || getPromptHotTakeClaim(MATCH_ID, promptId) === userId;
      const engine = getPromptEngine();
      const ok = engine.submitVote(promptId, userId, optionId, {
        hotTake: armed,
        matchId: MATCH_ID,
      });
      if (!ok) return false;

      setHotTakeOn(armed);
      void syncSubmitVote(promptId, userId, optionId, armed, true);
      if (armed && rivalUserId) {
        void syncSignalHotTake(promptId, userId, rivalUserId);
      }
      return true;
    },
    [enabled, hotTakeOn, rivalUserId, userId],
  );

  return {
    remaining,
    hotTakeOn,
    setHotTakeOn: applyHotTakeToggle,
    rivalHotTakePromptId,
    vote,
  };
}
