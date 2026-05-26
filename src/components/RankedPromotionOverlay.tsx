import { useEffect, useRef, useState } from 'react';
import { TIER_COLORS, TIER_LABELS, type Tier } from '../domain/tiers';
import './RankedPromotionOverlay.css';

const DISMISS_DELAY_MS = 2000;

export interface RankedPromotionOverlayProps {
  newTier: Tier;
  onDismiss: () => void;
}

export function RankedPromotionOverlay({ newTier, onDismiss }: RankedPromotionOverlayProps) {
  const [canDismiss, setCanDismiss] = useState(false);
  const colors = TIER_COLORS[newTier];
  const dismissedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setCanDismiss(true), DISMISS_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    if (!canDismiss || dismissedRef.current) return;
    dismissedRef.current = true;
    onDismiss();
  };

  return (
    <div
      className="ranked-promo"
      role="dialog"
      aria-modal="true"
      aria-label={`Promoted to ${TIER_LABELS[newTier]}`}
      onClick={handleDismiss}
    >
      <div className="ranked-promo__inner">
        <div
          className="ranked-promo__shield"
          style={{
            color: colors.fg,
            background: `linear-gradient(145deg, ${colors.bg}, color-mix(in srgb, ${colors.bg} 65%, #000))`,
            boxShadow: `0 0 48px ${colors.glow}`,
          }}
          aria-hidden="true"
        >
          🛡
        </div>
        <h1 className="ranked-promo__welcome">
          Welcome to <span>{TIER_LABELS[newTier]}</span>
        </h1>
        <p className={`ranked-promo__hint ${canDismiss ? 'is-ready' : ''}`}>
          {canDismiss ? 'Tap to continue' : '…'}
        </p>
      </div>
    </div>
  );
}
