import { useEffect, useState } from 'react';
import type { MatchSummaryData } from '../domain/rankedMatchSummary';
import { TIER_COLORS } from '../domain/tiers';
import { TierBadge } from './TierBadge';
import './MatchSummary.css';

function useAnimatedNumber(from: number, to: number, durationMs = 800): number {
  const [value, setValue] = useState(from);

  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(from + (to - from) * t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from, to, durationMs]);

  return value;
}

export interface MatchSummaryProps {
  data: MatchSummaryData;
  onClose: () => void;
  onBackToHome: () => void;
}

export function MatchSummary({
  data,
  onClose,
  onBackToHome,
}: MatchSummaryProps) {
  const playedDate = new Date(data.playedAt);
  const weeklyAnimated = useAnimatedNumber(0, data.weeklyAdded, 800);
  const seasonalAnimated = useAnimatedNumber(0, data.seasonalAdded, 800);
  const [barFill, setBarFill] = useState(data.tierProgress.fillPercentBefore);

  useEffect(() => {
    const t = window.setTimeout(
      () => setBarFill(data.tierProgress.fillPercent),
      80,
    );
    return () => window.clearTimeout(t);
  }, [data.tierProgress.fillPercent, data.tierProgress.fillPercentBefore]);

  const tierColors = TIER_COLORS[data.tierProgress.tier];

  return (
    <div className="match-summary" role="main" aria-label="Match summary">
      <header className="match-summary__header">
        <div>
          <h1 className="match-summary__title">Match Summary</h1>
          <p className="match-summary__caption">
            {playedDate.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}{' '}
            ·{' '}
            {playedDate.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <button
          type="button"
          className="match-summary__close"
          onClick={onClose}
          aria-label="Close match summary"
        >
          ✕
        </button>
      </header>

      <div className="match-summary__scroll">
        <section className="match-summary__card match-summary__card--hero">
          <p className="match-summary__card-label">Points earned this match</p>
          <p className="match-summary__points tabular">{data.matchPoints}p</p>
          <div className="match-summary__breakdown">
            <p>Base points: <span className="tabular">{data.breakdown.basePoints}p</span></p>
            {data.breakdown.streakBonus > 0 && (
              <p>Streak bonus: <span className="tabular">+{data.breakdown.streakBonus}p</span></p>
            )}
            {data.breakdown.hotTakeBonus > 0 && (
              <p>Hot take bonus: <span className="tabular">+{data.breakdown.hotTakeBonus}p</span></p>
            )}
          </div>
        </section>

        <section className="match-summary__card">
          <p className="match-summary__card-label">Points added to your totals</p>
          <p className="match-summary__totals-row tabular">
            Weekly: +{weeklyAnimated.toLocaleString()}p from this match
          </p>
          <p className="match-summary__totals-row tabular">
            Seasonal: +{seasonalAnimated.toLocaleString()}p from this match
          </p>
        </section>

        <section className="match-summary__card">
          <p className="match-summary__card-label">Tier progress</p>
          <div className="match-summary__tier-head">
            {data.tierProgress.nextTier ? (
              <>
                <TierBadge tier={data.tierProgress.tier} size="sm" />
                <span className="match-summary__tier-arrow" aria-hidden="true">
                  →
                </span>
                <TierBadge tier={data.tierProgress.nextTier} size="sm" />
              </>
            ) : (
              <TierBadge tier={data.tierProgress.tier} size="sm" />
            )}
          </div>
          <div
            className="match-summary__tier-track"
            role="progressbar"
            aria-valuenow={barFill}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="match-summary__tier-fill"
              style={{
                width: `${barFill}%`,
                background: `linear-gradient(90deg, ${tierColors.bg}, ${tierColors.fg})`,
              }}
            />
          </div>
          <p
            className={`match-summary__tier-copy ${
              data.tierProgress.promoted
                ? 'is-promoted'
                : data.tierProgress.muted
                  ? 'is-muted'
                  : ''
            }`}
          >
            {data.tierProgress.label}
          </p>
        </section>

        {data.hotTakeLines.length > 0 && (
          <section className="match-summary__card">
            <p className="match-summary__card-label">Hot takes</p>
            <ul className="match-summary__ht-list">
              {data.hotTakeLines.map((line) => (
                <li key={line.userId}>
                  <span className="match-summary__ht-name">{line.displayName}:</span>{' '}
                  {line.hits > 0 && (
                    <span className="match-summary__ht-hit">
                      <span aria-hidden="true">🔥</span> {line.hits} hit
                      {line.hits > 1 ? 's' : ''} (+{line.hitPoints}p)
                    </span>
                  )}
                  {line.hits > 0 && line.misses > 0 ? ', ' : ''}
                  {line.misses > 0 && (
                    <span className="match-summary__ht-miss">
                      <span aria-hidden="true">🔥</span> {line.misses} miss
                      {line.misses > 1 ? 'es' : ''} (+0p)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.timeline.length > 0 && (
          <section className="match-summary__card match-summary__card--timeline">
            <p className="match-summary__card-label">Round-by-round</p>
            <ul className="match-summary__timeline">
              {data.timeline.map((row) => (
                <li key={row.promptId} className="match-summary__round">
                  <div className="match-summary__round-top">
                    <span className="match-summary__round-num tabular">#{row.round}</span>
                    <span className="match-summary__round-q">{row.copy}</span>
                    {row.hotTake && (
                      <span className="match-summary__round-flame" aria-label="Hot take">
                        🔥
                      </span>
                    )}
                  </div>
                  <p className="match-summary__round-meta">
                    Your pick: <strong>{row.pickedLabel}</strong> ·{' '}
                    {row.won ? 'Correct' : 'Wrong'} ·{' '}
                    <span className={row.payout > 0 ? 'is-pos' : ''}>
                      {row.payout > 0 ? `+${row.payout}p` : '+0p'}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="match-summary__actions">
        <button type="button" className="match-summary__cta match-summary__cta--primary" onClick={onBackToHome}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
