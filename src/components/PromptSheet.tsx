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
 * Collapse: while a prompt is open or locked, the viewer can collapse the sheet
 * to a thin pill at the bottom — with or without a vote — so the event feed stays
 * visible. On resolved, voters are auto-expanded so the outcome can't be missed;
 * if they sat out, they can collapse the result pill; it auto-dismisses after a few seconds.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PromptInstance } from '../domain/promptTypes';
import type { RoomMember } from '../domain/watchRoomTypes';
import { PROMPT_WINDOW_MS } from '../sim/promptEngine';
import { LivePickReveal, type PickRevealMode } from './LivePickReveal';
import { PromptCommentThread } from './PromptCommentThread';
import './PromptSheet.css';

export interface PromptSheetProps {
  prompt: PromptInstance | null;
  myPickedOptionId: string | null;
  viewerId: string;
  onVote: (optionId: string) => boolean;
  pickRevealMode?: PickRevealMode;
  roomMembers?: RoomMember[];
  /** When set, enables Watch Room comment thread on this prompt. */
  roomId?: string;
  /** Freezes the vote countdown while the match sim is paused. */
  matchPaused?: boolean;
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

export function PromptSheet({
  prompt,
  myPickedOptionId,
  viewerId,
  onVote,
  pickRevealMode = 'both-voted',
  roomMembers = [],
  roomId,
  matchPaused = false,
}: PromptSheetProps) {
  // Auto-dismiss the resolved overlay shortly after resolution.
  // (The engine clears `active` after 3.2s; we fade out a touch earlier.)
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Tap-to-show rules popover (mobile-first: no hover-only tooltips per spec).
  const [helpOpen, setHelpOpen] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frozenSecondsRef = useRef<number | null>(null);
  // Wall-clock tick so the countdown ring updates smoothly even when no
  // engine event fires (the engine ticks at sim cadence; this drives UI).
  const [, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (!prompt || prompt.state !== 'open' || matchPaused) return;
    const t = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(t);
  }, [prompt?.id, prompt?.state, matchPaused]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!matchPaused) frozenSecondsRef.current = null;
  }, [matchPaused]);

  useEffect(() => {
    if (!prompt) {
      setDismissed(false);
      setCollapsed(false);
      setHelpOpen(false);
      return;
    }
    if (prompt.state === 'resolved') {
      // Voters always see the full result; everyone auto-dismisses shortly after.
      if (myPickedOptionId !== null) {
        setCollapsed(false);
      }
      setHelpOpen(false);
      dismissTimerRef.current = setTimeout(() => setDismissed(true), 2900);
      return () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      };
    }
  }, [prompt?.state, prompt?.id, myPickedOptionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fresh prompt → fresh expanded view. (Same component instance re-renders
  // for back-to-back prompts; without this the "collapsed" / "helpOpen"
  // carries over.)
  useEffect(() => {
    setCollapsed(false);
    setHelpOpen(false);
  }, [prompt?.id]);

  const visible = !!prompt && !dismissed;
  const secondsLeft = useMemo(() => {
    if (!prompt) return 0;
    if (matchPaused && frozenSecondsRef.current !== null) {
      return frozenSecondsRef.current;
    }
    const sec = Math.max(0, (prompt.closesAtWallMs - Date.now()) / 1000);
    if (matchPaused) frozenSecondsRef.current = sec;
    return sec;
  }, [prompt?.closesAtWallMs, prompt?.serverMinute, matchPaused]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!prompt) return null;

  const totalVotes = Object.values(prompt.voteCounts).reduce((s, n) => s + n, 0);
  const showResult = prompt.state === 'resolved';
  const winnerId = prompt.winningOptionId;
  const myWon = showResult && myPickedOptionId !== null && myPickedOptionId === winnerId;
  const myPayout = prompt.payouts?.[viewerId] ?? 0;
  // (The actual coin balance animation lives in CoinBalance — driven by useUserBalance.
  // This sheet only narrates the result.)

  const pickedOption = prompt.options.find((o) => o.id === myPickedOptionId) ?? null;
  const satOut = myPickedOptionId === null;
  const canCollapse =
    prompt.state === 'open' || prompt.state === 'locked' || (prompt.state === 'resolved' && satOut);

  const onDismiss = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setDismissed(true);
  };

  // ── Collapsed view: thin pill at the bottom, lets the event feed breathe.
  if (visible && collapsed && canCollapse) {
    const miniLabel =
      prompt.state === 'resolved'
        ? 'RESULT'
        : pickedOption && prompt.state === 'open'
          ? 'YOUR PICK · LIVE'
          : pickedOption && prompt.state === 'locked'
            ? 'YOUR PICK · LOCKED'
            : prompt.state === 'open'
              ? 'LIVE PROMPT'
              : 'PROMPT · LOCKED';
    const miniDetail =
      prompt.state === 'resolved'
        ? 'You sat this one out'
        : pickedOption?.label ?? prompt.copy;

    return (
      <div className="ps ps--collapsed is-visible" role="region" aria-label="Active prediction (collapsed)">
        <button
          type="button"
          className="ps-mini"
          onClick={() => setCollapsed(false)}
          aria-label="Expand prediction"
        >
          <span className="ps-mini__state" data-state={prompt.state} aria-hidden="true" />
          <span className="ps-mini__txt">
            <span className="ps-mini__label">{miniLabel}</span>
            <span className="ps-mini__option">{miniDetail}</span>
          </span>
          {prompt.state === 'open' ? (
            <span className="ps-mini__timer tabular" aria-label={`${Math.ceil(secondsLeft)} seconds left`}>
              {Math.max(0, Math.ceil(secondsLeft))}s
            </span>
          ) : prompt.state === 'locked' ? (
            <span className="ps-mini__timer" aria-hidden="true">🔒</span>
          ) : null}
          <span className="ps-mini__chev" aria-hidden="true">↑</span>
        </button>
      </div>
    );
  }

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
          <div className="ps__top-right">
            {prompt.state === 'open' ? (
              <CountdownRing secondsLeft={secondsLeft} totalSeconds={WINDOW_REAL_SEC} />
            ) : (
              <span className="ps__votes tabular">{totalVotes} votes</span>
            )}
            {canCollapse && (
              <button
                type="button"
                className="ps__collapse"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse prediction"
                title="Collapse"
              >
                ↓
              </button>
            )}
          </div>
        </div>

        <div className="ps__qrow">
          <h2 className="ps__q">{prompt.copy}</h2>
          <button
            type="button"
            className="ps__help"
            aria-label="How rewards work"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen((v) => !v)}
          >
            ⓘ
          </button>
        </div>

        {helpOpen && (
          <div className="ps__tooltip" role="tooltip" aria-live="polite">
            <div className="ps__tooltip-title">How rewards work</div>
            <ul className="ps__tooltip-list">
              <li>
                <strong>Vote within {WINDOW_REAL_SEC}s.</strong> Window enforced
                server-side — late votes don&apos;t count.
              </li>
              <li>
                <strong>Odds reward minority correct picks.</strong> Payout = base ×
                <span className="tabular"> min(1 / your_vote_share, 5.0)</span>.
              </li>
              <li>
                <strong>Wrong = 0 coins.</strong> Never negative. Never real money.
              </li>
            </ul>
          </div>
        )}

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

        {prompt && (
          <LivePickReveal
            prompt={prompt}
            viewerId={viewerId}
            mode={pickRevealMode}
            members={roomMembers}
          />
        )}

        {roomId && (
          <PromptCommentThread
            roomId={roomId}
            prompt={prompt}
            viewerId={viewerId}
            members={roomMembers}
          />
        )}

        {prompt.state === 'open' && (
          <p className="ps__hint">
            <span className="ps__hint-i">ⓘ</span> Vote within {WINDOW_REAL_SEC}s. Odds reward minority correct picks.
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
