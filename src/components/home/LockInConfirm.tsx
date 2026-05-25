import { useEffect, useState } from 'react';
import { getFixtureById } from '../../domain/matchday';
import './LockInConfirm.css';

export interface LockInConfirmProps {
  fixtureId: string;
  fixtureLabel: string;
  onDone: () => void;
}

export function LockInConfirm({ fixtureId, fixtureLabel, onDone }: LockInConfirmProps) {
  const [visible, setVisible] = useState(false);
  const fixture = getFixtureById(fixtureId);
  const kickoff = fixture?.kickoffLabel ?? '';

  useEffect(() => {
    const enter = requestAnimationFrame(() => setVisible(true));
    const done = setTimeout(onDone, 2400);
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div className={`lock-in-confirm${visible ? ' is-visible' : ''}`} role="status" aria-live="polite">
      <div className="lock-in-confirm__card">
        <span className="lock-in-confirm__ring" aria-hidden="true">
          <span className="lock-in-confirm__check">✓</span>
        </span>
        <p className="lock-in-confirm__eyebrow">LOCKED IN</p>
        <h2 className="lock-in-confirm__title">{fixtureLabel}</h2>
        {kickoff && <p className="lock-in-confirm__kick">Kickoff {kickoff}</p>}
        <p className="lock-in-confirm__hint">One ranked match this gameweek — play when your match goes live.</p>
      </div>
    </div>
  );
}
