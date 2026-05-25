import type { MeProfile } from '../../domain/profileTypes';
import { WINS_TO_ADVANCE, type Tier } from '../../domain/tiers';
import './MeTab.css';

export interface MeTierBarProps {
  profile: MeProfile;
}

function nextTier(tier: Tier): Tier | null {
  const order: Tier[] = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'CHAMPION'];
  const idx = order.indexOf(tier);
  if (idx < 0 || idx >= order.length - 1) return null;
  return order[idx + 1]!;
}

export function MeTierBar({ profile }: MeTierBarProps) {
  const needed = WINS_TO_ADVANCE[profile.tier];
  const upcoming = nextTier(profile.tier);
  const pct =
    needed === null || needed <= 0
      ? 100
      : Math.min(100, Math.round((profile.tierWinsTowardNext / needed) * 100));

  return (
    <section className="me-tier" aria-label="Tier progression">
      <div className="me-tier__head">
        <h2 className="me-section__title">Tier progress</h2>
        {upcoming ? (
          <span className="me-tier__next">
            {profile.tierWinsTowardNext}/{needed} wins to {upcoming.charAt(0)}
            {upcoming.slice(1).toLowerCase()}
          </span>
        ) : (
          <span className="me-tier__next">Champion — top tier</span>
        )}
      </div>
      <div className="me-tier__track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="me-tier__fill" style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}
