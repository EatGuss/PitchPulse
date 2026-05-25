import { useEffect, useState } from 'react';
import { EventFeed } from '../EventFeed';
import type { DemoUserId } from '../../data/personas';
import { demoFixtureDisplayTitle } from '../../domain/matchday';
import type { MatchInfo, NormalizedEvent } from '../../domain/types';
import { useMatchSimState } from '../../hooks/useMatchSimState';
import './LiveFeedSheet.css';

export interface LiveFeedSheetProps {
  open: boolean;
  userId: DemoUserId;
  info: MatchInfo;
  events: NormalizedEvent[];
  onClose: () => void;
}

export function LiveFeedSheet({ open, userId, info, events, onClose }: LiveFeedSheetProps) {
  const { clock } = useMatchSimState();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const fixtureLabel = demoFixtureDisplayTitle();
  const title = `Live Feed — ${fixtureLabel} ${clock.displayClock}`;

  return (
    <div
      className={`live-feed-sheet${entered ? ' is-visible' : ''}`}
      role="presentation"
    >
      <button
        type="button"
        className="live-feed-sheet__backdrop"
        onClick={onClose}
        aria-label="Close live feed"
      />
      <div
        className="live-feed-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="live-feed-sheet__handle" aria-hidden="true" />
        <header className="live-feed-sheet__head">
          <div className="live-feed-sheet__head-main">
            <span className="live-feed-sheet__live-dot" aria-hidden="true" />
            <h2 className="live-feed-sheet__title">{title}</h2>
          </div>
          <button
            type="button"
            className="live-feed-sheet__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <p className="live-feed-sheet__sub">Events only — no prompts or points</p>
        <div className="live-feed-sheet__body">
          <EventFeed events={events} info={info} viewerId={userId} />
        </div>
      </div>
    </div>
  );
}
