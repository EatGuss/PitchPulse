import { useEffect, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import { titleById } from '../domain/titles';
import { useTitleUnlockQueue } from '../hooks/useTitleUnlockQueue';
import './TitleUnlockToast.css';

const TOAST_DURATION_MS = 3200;

const TITLE_UNLOCK_ICONS: Record<string, string> = {
  'hot-take-hero': '🔥',
  sharpshooter: '🎯',
  sniper: '🎯',
  oracle: '🔮',
  analyst: '📊',
  veteran: '⭐',
  'comeback-king': '👑',
  'perfect-match': '💎',
};

export interface TitleUnlockToastProps {
  viewerId: DemoUserId;
}

export function TitleUnlockToast({ viewerId }: TitleUnlockToastProps) {
  const { head, dismiss } = useTitleUnlockQueue(viewerId);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!head) return;
    setLeaving(false);
    const enterT = setTimeout(() => setLeaving(true), TOAST_DURATION_MS - 320);
    const exitT = setTimeout(() => dismiss(), TOAST_DURATION_MS);
    return () => {
      clearTimeout(enterT);
      clearTimeout(exitT);
    };
  }, [head, dismiss]);

  if (!head) return null;

  const titleName = head.label.replace(/^Title unlocked: /, '');
  const def = titleById(head.titleId);
  const icon = TITLE_UNLOCK_ICONS[head.titleId] ?? '🏅';

  return (
    <div
      className={`tunlock-toast ${leaving ? 'is-leaving' : 'is-entering'}`}
      role="status"
      aria-live="polite"
    >
      <div className="tunlock-toast__badge" aria-hidden="true">
        {icon}
      </div>
      <div className="tunlock-toast__body">
        <div className="tunlock-toast__cat">Title unlocked</div>
        <div className="tunlock-toast__title">{titleName}</div>
        {def?.hint ? <div className="tunlock-toast__sub">{def.hint}</div> : null}
      </div>
    </div>
  );
}
