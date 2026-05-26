import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserRankedOutcome } from '../../domain/rankedTypes';
import { OutcomeDrawVariant } from './OutcomeDrawVariant';
import { OutcomeLoseVariant } from './OutcomeLoseVariant';
import { OutcomeWinVariant } from './OutcomeWinVariant';
import './OutcomeScreen.css';

const FADE_IN_MS = 400;
const FADE_OUT_MS = 200;
const TAP_DELAY_MS = 1000;
const HINT_DELAY_MS = 1500;
const AUTO_ADVANCE_MS = 3500;

export interface OutcomeScreenProps {
  outcome: UserRankedOutcome;
  userDisplayName: string;
  opponentName: string;
  userPoints: number;
  opponentPoints: number;
  onDismiss: () => void;
}

export function OutcomeScreen({
  outcome,
  userDisplayName,
  opponentName,
  userPoints,
  opponentPoints,
  onDismiss,
}: OutcomeScreenProps) {
  const [showHint, setShowHint] = useState(false);
  const [canTap, setCanTap] = useState(false);
  const [exiting, setExiting] = useState(false);
  const dismissedRef = useRef(false);
  const mountMsRef = useRef(Date.now());

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setExiting(true);
    window.setTimeout(() => onDismiss(), FADE_OUT_MS);
  }, [onDismiss]);

  useEffect(() => {
    const tapTimer = window.setTimeout(() => setCanTap(true), TAP_DELAY_MS);
    const hintTimer = window.setTimeout(() => setShowHint(true), HINT_DELAY_MS);
    const autoTimer = window.setTimeout(dismiss, AUTO_ADVANCE_MS);
    return () => {
      window.clearTimeout(tapTimer);
      window.clearTimeout(hintTimer);
      window.clearTimeout(autoTimer);
    };
  }, [dismiss]);

  const handleTap = () => {
    if (!canTap || Date.now() - mountMsRef.current < TAP_DELAY_MS) return;
    dismiss();
  };

  const variantProps = {
    userDisplayName,
    opponentName,
    userPoints,
    opponentPoints,
    showHint,
  };

  return (
    <div
      className={`outcome-overlay ${exiting ? 'is-exiting' : 'is-entering'}`}
      role="dialog"
      aria-modal="true"
      aria-label={
        outcome === 'WIN' ? 'Victory' : outcome === 'LOSE' ? 'Match over' : 'Draw'
      }
      style={{ animationDuration: exiting ? `${FADE_OUT_MS}ms` : `${FADE_IN_MS}ms` }}
      onClick={handleTap}
    >
      {outcome === 'WIN' && <OutcomeWinVariant {...variantProps} />}
      {outcome === 'LOSE' && <OutcomeLoseVariant {...variantProps} />}
      {outcome === 'DRAW' && <OutcomeDrawVariant {...variantProps} />}
    </div>
  );
}
