/**
 * PromptSheet — bottom-sheet UI for the Matchday Shots prompt overlay.
 *
 * Slides up from the phone's bottom edge with a drag handle and dim backdrop
 * (PITCHPULSE.md §8.2). Renders three sequential states:
 *   - 'open'     : countdown ring, question, full-width stacked vote buttons,
 *                  live %, viewer's picked option highlighted
 *   - 'locked'   : window closed, "Waiting for resolution…", picks frozen
 *   - 'resolved' : winner badge, +N coin animation OR "No coins this round"
 *
 * Note: no drag-to-dismiss. The voter cannot escape an active prompt — that's
 * how the multiplayer + gamification pillar stays honest.
 */

import { useEffect, useMemo, useState } from 'react';
import type { PromptInstance } from '../domain/promptTypes';
import { PROMPT_WINDOW_MS } from '../sim/promptEngine';
import './PromptSheet.css';

export interface PromptSheetProps {
  prompt: PromptInstance | null;
  myPickedOptionId: string | null;
  /** Used to look up the viewer's payout from prompt.payouts on resolution. */
  viewerId: string;
  onVote: (optionId: string) => boolean;
}

const WINDOW_REAL_SEC = PROMPT_WINDOW_MS / 1000;

function CountdownRing({ secondsLeft, totalSeconds }: { secondsLeft: number; totalSeconds: number }) {
  const ratio = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const R = 14;
  const C = 2 * Math.PI * R;
  return (
    <span className="ps-cd" aria-label={`${Math.ceil(secondsLeft)} seconds left`}>
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r={R} fill="none" stroke="var(--pp-surface-3)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={R}
          fill="none"
          stroke="var(--pp-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - ratio)}
          transform="rotate(-90 18 18)"
          style={{ transition: 'stroke-dashoffset 200ms linear' }}
        />
      </svg>
      <span className="ps-cd__num tabular">{Math.max(0, Math.ceil(secondsLeft))}</span>
    </span>
  );
}

function OptionButton({
  label,
  sublabel,
  pct,
  picked,
  disabled,
  state,
  showResult,
  isWinner,
  onClick,
}: {
  label: string;
  sublabel?: string;
  pct: number;
  picked: boolean;
  disabled: boolean;
  state: PromptInstance['state'];
  showResult: boolean;
  isWinner: boolean;
  onClick: () => void;
}) {
  // Translate engine state -> CSS modifier (open shows 'live' bar, etc.)
  const cssState = state === 'open' ? 'live' : state;
  const cls = [
    'ps-opt',
    picked && 'is-picked',
    disabled && 'is-disabled',
    `is-${cssState}`,
    showResult && (isWinner ? 'is-winner' : 'is-loser'),
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-pressed={picked}>
      <span className="ps-opt__bar" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      <span className="ps-opt__body">
        <span className="ps-opt__label">{label}</span>
        {sublabel && <span className="ps-opt__sub">{sublabel}</span>}
      </span>
      <span className="ps-opt__pct tabular">{Math.round(pct)}%</span>
      {picked && (
        <span className="ps-opt__check" aria-hidden="true">
          ✓
        </span>
      )}
    </button>
  );
}

export function PromptSheet({ prompt, myPickedOptionId, viewerId, onVote }: PromptSheetProps) {
  // Auto-dismiss the resolved overlay shortly after resolution.
  // (The engine clears `active` after 3.2s; we fade out a touch earlier.)
  const [dismissed, setDismissed] = useState(false);
  // Wall-clock tick so the countdown ring updates smoothly even when no
  // engine event fires (the engine ticks at sim cadence; this drives UI).
  const [, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (!prompt || prompt.state !== 'open') return;
    const t = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(t);
  }, [prompt?.id, prompt?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!prompt) {
      setDismissed(false);
      return;
    }
    if (prompt.state === 'resolved') {
      const t = setTimeout(() => setDismissed(true), 2900);
      return () => clearTimeout(t);
    }
  }, [prompt?.state, prompt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = !!prompt && !dismissed;
  const secondsLeft = useMemo(() => {
    if (!prompt) return 0;
    return Math.max(0, (prompt.closesAtWallMs - Date.now()) / 1000);
  }, [prompt?.closesAtWallMs, prompt?.serverMinute]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!prompt) return null;

  const totalVotes = Object.values(prompt.voteCounts).reduce((s, n) => s + n, 0);
  const showResult = prompt.state === 'resolved';
  const winnerId = prompt.winningOptionId;
  const myWon = showResult && myPickedOptionId !== null && myPickedOptionId === winnerId;
  const myPayout = prompt.payouts?.[viewerId] ?? 0;
  // (The actual coin balance animation lives in CoinBalance — driven by useUserBalance.
  // This sheet only narrates the result.)

  return (
    <div className={`ps ${visible ? 'is-visible' : 'is-leaving'}`} role="dialog" aria-modal="true" aria-label="Live prediction">
      <div className="ps__backdrop" aria-hidden="true" />
      <div className="ps__panel">
        <div className="ps__handle" aria-hidden="true" />

        <div className="ps__top">
          <div className="ps__top-left">
            <span className="ps__cat">{prompt.category.toUpperCase()}</span>
            <span className="ps__state-dot" data-state={prompt.state} />
            <span className="ps__state-label">
              {prompt.state === 'open' ? 'LIVE' : prompt.state === 'locked' ? 'LOCKED' : 'RESULT'}
            </span>
          </div>
          {prompt.state === 'open' ? (
            <CountdownRing secondsLeft={secondsLeft} totalSeconds={WINDOW_REAL_SEC} />
          ) : (
            <span className="ps__votes tabular">{totalVotes} votes</span>
          )}
        </div>

        <h2 className="ps__q">{prompt.copy}</h2>

        <div className="ps__opts">
          {prompt.options.map((opt) => {
            const count = prompt.voteCounts[opt.id] ?? 0;
            const pct = totalVotes === 0 ? 0 : (count / totalVotes) * 100;
            const picked = myPickedOptionId === opt.id;
            const disabled = prompt.state !== 'open';
            const isWinner = showResult && winnerId === opt.id;
            return (
              <OptionButton
                key={opt.id}
                label={opt.label}
                sublabel={opt.sublabel}
                pct={pct}
                picked={picked}
                disabled={disabled}
                state={prompt.state}
                showResult={showResult}
                isWinner={isWinner}
                onClick={() => onVote(opt.id)}
              />
            );
          })}
        </div>

        {prompt.state === 'open' && (
          <p className="ps__hint">
            <span className="ps__hint-i">ⓘ</span> Vote within 30s. Odds reward minority correct picks.
          </p>
        )}
        {prompt.state === 'locked' && (
          <p className="ps__hint">
            <span className="ps__hint-i">🔒</span> Window closed. Waiting for the trigger to resolve this prediction…
          </p>
        )}
        {prompt.state === 'resolved' && (
          <p className={`ps__hint ${myWon ? 'is-win' : 'is-lose'}`}>
            {myPickedOptionId === null
              ? 'You sat this one out.'
              : myWon
                ? `Nice call. Coins on the way. ${myPayout > 0 ? `+${myPayout}c` : ''}`
                : 'Better luck on the next one.'}
          </p>
        )}
      </div>
    </div>
  );
}
