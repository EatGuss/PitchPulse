import { DEMO_USERS } from '../../data/personas';
import type { MeProfile } from '../../domain/profileTypes';
import { TierBadge } from '../TierBadge';
import './MeTab.css';

export interface MeProfileHeaderProps {
  profile: MeProfile;
  onEditTitle: () => void;
  onOpenSettings: () => void;
}

export function MeProfileHeader({ profile, onEditTitle, onOpenSettings }: MeProfileHeaderProps) {
  const user = DEMO_USERS[profile.userId];

  return (
    <header className="me-head">
      <button
        type="button"
        className="me-head__settings"
        aria-label="Settings"
        onClick={onOpenSettings}
      >
        ⚙
      </button>
      <span className="me-head__avatar" aria-hidden="true">
        {user?.avatar ?? '👤'}
      </span>
      <h1 className="me-head__name">{user?.displayName ?? profile.userId}</h1>
      <p className="me-head__tagline">{user?.tagline}</p>
      <div className="me-head__badges">
        <TierBadge tier={profile.tier} size="md" />
        <button type="button" className="me-head__title-btn" onClick={onEditTitle}>
          <span className="me-head__title">
            {profile.equippedTitle ?? 'No title equipped'}
          </span>
          <span className="me-head__edit" aria-hidden="true">
            ✎
          </span>
        </button>
      </div>
    </header>
  );
}
