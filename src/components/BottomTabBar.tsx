/**
 * BottomTabBar — cosmetic in Gate 1 (no other tabs exist yet). Hardcoded to the
 * "Match" tab so the screen looks like a real native app. Tap targets >=44px
 * so when other tabs land in Gate 3+, switching is touch-friendly.
 */

import './BottomTabBar.css';

const TABS = [
  { id: 'match', label: 'Match',  icon: '⚽' },
  { id: 'live',  label: 'Live',   icon: '📡' },
  { id: 'board', label: 'Board',  icon: '🏆' },
  { id: 'me',    label: 'Me',     icon: '👤' },
] as const;

export interface BottomTabBarProps {
  active?: typeof TABS[number]['id'];
}

export function BottomTabBar({ active = 'match' }: BottomTabBarProps) {
  return (
    <nav className="btb" aria-label="Primary">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`btb__tab ${active === t.id ? 'is-active' : ''}`}
          aria-current={active === t.id ? 'page' : undefined}
          aria-label={t.label}
        >
          <span className="btb__icon" aria-hidden="true">{t.icon}</span>
          <span className="btb__label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
