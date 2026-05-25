import { useEffect, useRef, useState } from 'react';
import { DEMO_USERS, type DemoUserId } from '../data/personas';
import type { RankedOpponent } from '../domain/rankedTypes';
import { TierBadge } from './TierBadge';
import './OpponentReveal.css';

const COUNTDOWN_START = 3;

export interface OpponentRevealProps {
  opponent: RankedOpponent;
  onComplete: () => void;
}

export function OpponentReveal({ opponent, onComplete }: OpponentRevealProps) {
  const [count, setCount] = useState(COUNTDOWN_START);
  const [visible, setVisible] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const avatar =
    DEMO_USERS[opponent.opponentId as DemoUserId]?.avatar ?? '👤';

  useEffect(() => {
    const slide = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(slide);
  }, []);

  useEffect(() => {
    if (count <= 0) {
      onCompleteRef.current();
      return;
    }
    const tick = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(tick);
  }, [count]);

  return (
    <div className="opp-reveal" role="main" aria-label="Opponent reveal">
      <div className={`opp-reveal__card ${visible ? 'is-visible' : ''}`}>
        <p className="opp-reveal__eyebrow">YOUR OPPONENT</p>
        <div className="opp-reveal__avatar" aria-hidden="true">
          {avatar}
        </div>
        <h1 className="opp-reveal__name">{opponent.opponentName}</h1>
        <TierBadge tier={opponent.opponentTier} size="lg" />
        {opponent.opponentTitle && (
          <p className="opp-reveal__title">{opponent.opponentTitle}</p>
        )}
      </div>
      <p className="opp-reveal__countdown" aria-live="polite">
        {count > 0 ? (
          <>
            Match starts in <strong className="tabular">{count}</strong>…
          </>
        ) : (
          'Go!'
        )}
      </p>
    </div>
  );
}
