import type { MeProfile } from '../../domain/profileTypes';
import { formatLifetimeAccuracy } from '../../domain/accuracy';
import './MeTab.css';

const formatter = new Intl.NumberFormat('en-US');

export interface MeStatsCardProps {
  profile: MeProfile;
}

export function MeStatsCard({ profile }: MeStatsCardProps) {
  return (
    <section className="me-stats" aria-label="Your stats">
      <h2 className="me-section__title">Stats</h2>
      <div className="me-stats__grid">
        <div className="me-stats__cell">
          <span className="me-stats__label">Weekly</span>
          <span className="me-stats__val tabular">{formatter.format(profile.weeklyPoints)}</span>
        </div>
        <div className="me-stats__cell">
          <span className="me-stats__label">Seasonal</span>
          <span className="me-stats__val tabular">{formatter.format(profile.seasonalPoints)}</span>
        </div>
        <div className="me-stats__cell">
          <span className="me-stats__label">Accuracy</span>
          <span className="me-stats__val">{formatLifetimeAccuracy(profile.lifetimeAccuracy)}</span>
        </div>
        <div className="me-stats__cell">
          <span className="me-stats__label">Ranked played</span>
          <span className="me-stats__val tabular">{profile.rankedMatchesPlayed}</span>
        </div>
      </div>
    </section>
  );
}
