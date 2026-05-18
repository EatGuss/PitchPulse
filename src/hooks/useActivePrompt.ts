/**
 * useActivePrompt — subscribes the calling component to the PromptEngine's
 * single live prompt slot. Returns the current PromptInstance (or null) and a
 * stable vote() callback bound to the viewer id.
 *
 * The bus emits a fresh snapshot on every state transition AND on every
 * vote update, so React re-renders cover live odds in real time.
 */

import { useCallback, useEffect, useState } from 'react';
import { getPromptEngine } from '../sim/promptEngine';
import type { PromptInstance } from '../domain/promptTypes';

export interface UseActivePromptResult {
  prompt: PromptInstance | null;
  /** Submit a vote on the current open prompt for the given viewer id. */
  vote: (optionId: string) => boolean;
  /** Convenience: the viewer's own pick on the current prompt, if any. */
  myPickedOptionId: string | null;
}

export function useActivePrompt(viewerId: string): UseActivePromptResult {
  const engine = getPromptEngine();
  const [prompt, setPrompt] = useState<PromptInstance | null>(() => engine.getActive());

  useEffect(() => {
    const refresh = () => setPrompt(engine.getActive());
    const offs = [
      engine.bus.on('promptOpened', refresh),
      engine.bus.on('promptUpdated', refresh),
      engine.bus.on('promptClosed', refresh),
      engine.bus.on('promptResolved', refresh),
      engine.bus.on('reset', () => setPrompt(null)),
    ];
    // Drive a polling tick at ~5 Hz too, so the visible countdown timer ticks
    // without needing the engine to emit on every clock pulse.
    const t = setInterval(() => setPrompt(engine.getActive()), 200);
    return () => {
      offs.forEach((off) => off());
      clearInterval(t);
    };
  }, [engine]);

  const vote = useCallback(
    (optionId: string): boolean => {
      if (!prompt) return false;
      return engine.submitVote(prompt.id, viewerId, optionId);
    },
    [engine, prompt, viewerId],
  );

  const myPickedOptionId = prompt?.userVotes[viewerId] ?? null;

  return { prompt, vote, myPickedOptionId };
}
