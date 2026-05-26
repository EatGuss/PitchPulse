import { titleProgressLabel } from '../../domain/titleRules';
import { TITLE_CATALOG } from '../../domain/titles';
import type { MeProfile } from '../../domain/profileTypes';
import './MeTab.css';

export interface MeTitlesGridProps {
  profile: MeProfile;
  editing: boolean;
  equipping: boolean;
  onEquip: (titleId: string) => void;
}

export function MeTitlesGrid({ profile, editing, equipping, onEquip }: MeTitlesGridProps) {
  const unlocked = new Set(profile.unlockedTitleIds);
  const stats = {
    totalShots: profile.totalShots,
    correctShots: profile.correctShots,
    rankedMatchesPlayed: profile.rankedMatchesPlayed,
    unlockedTitleIds: profile.unlockedTitleIds,
  };

  return (
    <section className="me-titles" aria-label="Titles">
      <h2 className="me-section__title">Titles</h2>
      <div className="me-titles__grid">
        {TITLE_CATALOG.map((title) => {
          const isUnlocked = unlocked.has(title.id);
          const isEquipped = profile.equippedTitleId === title.id;
          const canTap = editing && isUnlocked && !equipping;

          return (
            <button
              key={title.id}
              type="button"
              className={`me-titles__tile${isUnlocked ? '' : ' me-titles__tile--locked'}${isEquipped ? ' me-titles__tile--equipped' : ''}`}
              disabled={!canTap}
              onClick={() => canTap && onEquip(title.id)}
              aria-pressed={isEquipped}
            >
              <span className="me-titles__name">{title.name}</span>
              <span className="me-titles__hint">
                {isUnlocked ? title.hint : titleProgressLabel(title.id, stats)}
              </span>
              {isEquipped ? <span className="me-titles__badge">Equipped</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
