/**
 * useBadgeQueue — subscribes a component to badge unlock notifications for one
 * viewer and returns a FIFO queue of "fresh" unlocks the toast UI should render
 * plus a callback to dismiss the head of the queue once its animation completes.
 *
 * Why a queue: badges can fire in bursts (e.g. half-time-hero + perfect-predictor
 * in the same tick when the HT prompt resolves with a win). The toast renders
 * them one-at-a-time so they read.
 */

import { useCallback, useEffect, useState } from 'react';
import { getBadgeEngine, type BadgeUnlock } from '../sim/badgeEngine';

export interface UseBadgeQueueResult {
  /** Next-to-show unlock, or null when the queue is empty. */
  head: BadgeUnlock | null;
  /** Pop the head off the queue (call when the toast finishes its animation). */
  dismiss: () => void;
  /** All unlocks accrued this session — useful for the static badge list. */
  history: BadgeUnlock[];
}

export function useBadgeQueue(viewerId: string): UseBadgeQueueResult {
  const engine = getBadgeEngine();
  const [queue, setQueue] = useState<BadgeUnlock[]>([]);
  const [history, setHistory] = useState<BadgeUnlock[]>([]);

  useEffect(() => {
    const offs = [
      engine.bus.on('badgeUnlocked', ({ unlock }) => {
        if (unlock.userId !== viewerId) return;
        setQueue((q) => [...q, unlock]);
        setHistory((h) => [...h, unlock]);
      }),
      engine.bus.on('reset', () => {
        setQueue([]);
        setHistory([]);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [engine, viewerId]);

  const dismiss = useCallback(() => {
    setQueue((q) => (q.length === 0 ? q : q.slice(1)));
  }, []);

  return { head: queue[0] ?? null, dismiss, history };
}
