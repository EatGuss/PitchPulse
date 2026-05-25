/**
 * HotTakeToggle — ranked-only 2.5× multiplier toggle (Gate J).
 */

import { HOT_TAKE_MULTIPLIER } from '../sim/hotTakeStore';
import './HotTakeToggle.css';

export interface HotTakeToggleProps {
  remaining: number;
  enabled: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}

export function HotTakeToggle({ remaining, enabled, onChange, disabled = false }: HotTakeToggleProps) {
  const canUse = remaining > 0 && !disabled;
  const off = !enabled || !canUse;

  return (
    <div className={`ht-toggle ${off ? 'is-off' : 'is-on'}`}>
      <button
        type="button"
        className="ht-toggle__btn"
        aria-pressed={enabled && canUse}
        disabled={!canUse}
        onClick={() => onChange(!enabled)}
      >
        <span className="ht-toggle__icon" aria-hidden="true">
          🔥
        </span>
        <span className="ht-toggle__copy">
          <span className="ht-toggle__label">Hot Take</span>
          <span className="ht-toggle__sub">
            {canUse ? `${remaining} left · ${HOT_TAKE_MULTIPLIER}× if correct` : 'No hot takes left'}
          </span>
        </span>
        <span className={`ht-toggle__pill ${enabled && canUse ? 'is-active' : ''}`} aria-hidden="true" />
      </button>
    </div>
  );
}
