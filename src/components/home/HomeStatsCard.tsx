import { TierBadge } from '../TierBadge';
import {
  tierProgressCopy,
  tierProgressSubtext,
  type TierProgress,
} from '../../hooks/useHomeTierProgress';
import './HomeStatsCard.css';

export interface HomeStatsCardProps {
  tierProgress: TierProgress;
  matchPointsThisMatch: number | null;
}

export function HomeStatsCard({ tierProgress, matchPointsThisMatch }: HomeStatsCardProps) {
  const played = matchPointsThisMatch !== null;

  return (
    <section className="hstats" aria-label="Your stats">
      <div className="hstats__tier">
        <TierBadge tier={tierProgress.tier} size="sm" />
        <div className="hstats__tier-meta">
          <span className="hstats__tier-copy">{tierProgressCopy(tierProgress)}</span>
          <span className="hstats__tier-sub">{tierProgressSubtext(tierProgress)}</span>
        </div>
      </div>
      <div className="hstats__points">
        <span className="hstats__points-label">Ranked match points</span>
        {played ? (
          <span className="hstats__points-val tabular">{matchPointsThisMatch}p</span>
        ) : (
          <span className="hstats__points-empty">Haven&apos;t played yet</span>
        )}
      </div>
    </section>
  );
}
