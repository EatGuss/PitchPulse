import { useEffect, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import { useTitleUnlockQueue } from '../hooks/useTitleUnlockQueue';
import './TitleUnlockToast.css';

const TOAST_DURATION_MS = 2600;

export interface TitleUnlockToastProps {
  viewerId: DemoUserId;
}

export function TitleUnlockToast({ viewerId }: TitleUnlockToastProps) {
  const { head, dismiss } = useTitleUnlockQueue(viewerId);
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

  return (
    <div
      className={`tunlock-toast ${leaving ? 'is-leaving' : 'is-entering'}`}
      role="status"
      aria-live="polite"
    >
      <div className="tunlock-toast__icon" aria-hidden="true">
        🏅
      </div>
      <div className="tunlock-toast__body">
        <div className="tunlock-toast__cat">Title unlocked</div>
        <div className="tunlock-toast__title">{head.label.replace(/^Title unlocked: /, '')}</div>
      </div>
    </div>
  );
}
