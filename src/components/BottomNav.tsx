/**
 * BottomNav — persistent 4-tab primary navigation (Home, Compete, Standings, Me).
 * Hidden during live match takeover (controlled by AppShell).
 */

import { APP_TABS, type AppTab } from '../domain/appTab';
import './BottomNav.css';

export interface BottomNavProps {
  active: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export function BottomNav({ active, onTabChange }: BottomNavProps) {
  return (
    <nav className="bnav" aria-label="Primary">
      {APP_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`bnav__tab ${active === t.id ? 'is-active' : ''}`}
          aria-current={active === t.id ? 'page' : undefined}
          aria-label={t.label}
          onClick={() => onTabChange(t.id)}
        >
          <span className="bnav__icon" aria-hidden="true">{t.icon}</span>
          <span className="bnav__label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
