/**
 * BadgeToast — slides in from the top-right of the phone for ~2.6s when a
 * badge unlocks for the viewer, then auto-dismisses. Only one toast at a time;
 * the queue drains FIFO via useBadgeQueue.
 *
 * Positioned absolute inside the phone so it sits on top of EventFeed and the
 * MatchHeader. It does NOT overlap a PromptSheet (PromptSheet is z-index 20;
 * this is z-index 25 — toasts should still be visible because they're brief
 * and important).
 */

import { useEffect, useState } from 'react';
import { useBadgeQueue } from '../hooks/useBadgeQueue';
import './BadgeToast.css';

const TOAST_DURATION_MS = 2600;

export interface BadgeToastProps {
  viewerId: string;
}

export function BadgeToast({ viewerId }: BadgeToastProps) {
  const { head, dismiss } = useBadgeQueue(viewerId);
  /** Local "leaving" state lets us play the exit animation before clearing. */
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!head) return;
    setLeaving(false);
    const enterT = setTimeout(() => setLeaving(true), TOAST_DURATION_MS - 280);
    const exitT = setTimeout(() => dismiss(), TOAST_DURATION_MS);
    return () => {
      clearTimeout(enterT);
      clearTimeout(exitT);
    };
  }, [head, dismiss]);

  if (!head) return null;

  const { definition } = head;
  return (
    <div
      className={`btoast ${leaving ? 'is-leaving' : 'is-entering'}`}
      role="status"
      aria-live="polite"
    >
      <div className="btoast__icon" aria-hidden="true">{definition.icon}</div>
      <div className="btoast__body">
        <div className="btoast__cat">Badge unlocked</div>
        <div className="btoast__title">{definition.label}</div>
        <div className="btoast__desc">{definition.description}</div>
      </div>
    </div>
  );
}
