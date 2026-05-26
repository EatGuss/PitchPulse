import { WINS_TO_ADVANCE, type Tier } from '../domain/tiers';
import { TierBadge } from './TierBadge';
import './RankedTierProgress.css';

function nextTier(tier: Tier): Tier | null {
  const order: Tier[] = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'CHAMPION'];
  const idx = order.indexOf(tier);
  if (idx < 0 || idx >= order.length - 1) return null;
  return order[idx + 1]!;
}

export interface RankedTierProgressProps {
  tier: Tier;
  tierWinsTowardNext: number;
}

export function RankedTierProgress({ tier, tierWinsTowardNext }: RankedTierProgressProps) {
  const needed = WINS_TO_ADVANCE[tier];
  const upcoming = nextTier(tier);
  const pct =
    needed === null || needed <= 0
      ? 100
      : Math.min(100, Math.round((tierWinsTowardNext / needed) * 100));

  return (
    <section className="rtp" aria-label="Tier progression">
      <div className="rtp__head">
        <TierBadge tier={tier} size="sm" />
        {upcoming ? (
          <span className="rtp__label tabular">
            {tierWinsTowardNext}/{needed} wins to {upcoming.charAt(0)}
            {upcoming.slice(1).toLowerCase()}
          </span>
        ) : (
          <span className="rtp__label">Champion — top tier</span>
        )}
      </div>
      <div
        className="rtp__track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="rtp__fill" style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}
