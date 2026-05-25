import { TIER_COLORS, TIER_LABELS, type Tier } from '../domain/tiers';
import './TierBadge.css';

export interface TierBadgeProps {
  tier: Tier;
  size?: 'sm' | 'md' | 'lg';
}

export function TierBadge({ tier, size = 'md' }: TierBadgeProps) {
  const colors = TIER_COLORS[tier];
  return (
    <span
      className={`tier-badge tier-badge--${size}`}
      style={{
        color: colors.fg,
        background: `linear-gradient(145deg, ${colors.bg}, color-mix(in srgb, ${colors.bg} 70%, #000))`,
        boxShadow: `0 4px 16px ${colors.glow}`,
      }}
      aria-label={`${TIER_LABELS[tier]} tier`}
    >
      <span className="tier-badge__shield" aria-hidden="true">🛡</span>
      <span className="tier-badge__label">{TIER_LABELS[tier]}</span>
    </span>
  );
}
