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

function hotTakeSubline(isActive: boolean, remaining: number, blockedByRival: boolean): string {
  if (blockedByRival) {
    return 'Rival claimed Hot Take on this prompt';
  }
  if (isActive) {
    if (remaining > 0) {
      return `${HOT_TAKE_MULTIPLIER}× locked in for this shot · ${remaining} left after`;
    }
    return `${HOT_TAKE_MULTIPLIER}× locked in · your last hot take this match`;
  }
  if (remaining > 0) {
    return `${remaining} left · ${HOT_TAKE_MULTIPLIER}× if correct`;
  }
  return 'No hot takes left this match';
}

export function HotTakeToggle({ remaining, enabled, onChange, disabled = false }: HotTakeToggleProps) {
  const blockedByRival = disabled && !enabled;
  const canArm = remaining > 0 && !disabled;
  const isActive = enabled;
  const btnDisabled = disabled || (!isActive && !canArm);

  return (
    <div className={`ht-toggle ${isActive ? 'is-on' : 'is-off'}`}>
      <button
        type="button"
        className="ht-toggle__btn"
        aria-pressed={isActive}
        disabled={btnDisabled}
        onClick={() => onChange(!enabled)}
      >
        <span className="ht-toggle__icon" aria-hidden="true">
          🔥
        </span>
        <span className="ht-toggle__copy">
          <span className="ht-toggle__label">
            Hot Take{isActive ? ' · ON' : ''}
          </span>
          <span className="ht-toggle__sub">{hotTakeSubline(isActive, remaining, blockedByRival)}</span>
        </span>
        <span className={`ht-toggle__pill ${isActive ? 'is-active' : ''}`} aria-hidden="true" />
      </button>
    </div>
  );
}
