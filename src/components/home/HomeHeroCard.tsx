import type { MatchdayHeroState } from '../../domain/matchday';
import {
  DEMO_MATCHDAY_NUMBER,
  DEMO_NEXT_MATCHDAY_LABEL,
  getFixtureById,
} from '../../domain/matchday';
import type { UserRankedMatchdayStatus } from '../../sim/matchdayStore';
import './HomeHeroCard.css';

export interface HomeHeroCardProps {
  state: MatchdayHeroState;
  rankedStatus: UserRankedMatchdayStatus;
  canChangePick?: boolean;
  matchdayOngoing?: boolean;
  onPlayRanked: (fixtureId: string) => void;
  onSelectMatchday: () => void;
}

export function HomeHeroCard({
  state,
  rankedStatus,
  canChangePick = false,
  matchdayOngoing = false,
  onPlayRanked,
  onSelectMatchday,
}: HomeHeroCardProps) {
  if (state === 'upcoming') {
    return (
      <section className="hhero hhero--upcoming" aria-label="Next matchday">
        <p className="hhero__eyebrow">MATCHDAY {DEMO_MATCHDAY_NUMBER}</p>
        <h2 className="hhero__title">Pick your ranked match</h2>
        <p className="hhero__sub">Lock in before kickoff — one ranked match per gameweek.</p>
        <button type="button" className="hhero__cta" onClick={onSelectMatchday}>
          Select your match
        </button>
      </section>
    );
  }

  if (state === 'locked_in') {
    const locked = getFixtureById(rankedStatus.lockedFixtureId ?? '');
    const label = rankedStatus.lockedFixtureLabel ?? 'Your match';
    const kickoff = locked?.kickoffLabel ?? '';

    return (
      <section className="hhero hhero--locked" aria-label="Ranked match locked in">
        <p className="hhero__eyebrow">MATCHDAY {DEMO_MATCHDAY_NUMBER}</p>
        <div className="hhero__lock-badge" aria-hidden="true">
          <span className="hhero__lock-icon">✓</span>
        </div>
        <h2 className="hhero__title">{label}</h2>
        <p className="hhero__sub">
          {kickoff ? `Kickoff ${kickoff} — play ranked when this match goes live.` : 'Waiting for kickoff…'}
        </p>
        {canChangePick ? (
          <button type="button" className="hhero__cta hhero__cta--secondary" onClick={onSelectMatchday}>
            Change match
          </button>
        ) : (
          <p className="hhero__hint">Your pick is locked for this gameweek.</p>
        )}
      </section>
    );
  }

  if (state === 'live_not_played') {
    const lockedId = rankedStatus.lockedFixtureId;
    const label = rankedStatus.lockedFixtureLabel ?? 'Your match';

    return (
      <section className="hhero hhero--live" aria-label="Matchday live">
        <p className="hhero__eyebrow hhero__eyebrow--live">● LIVE</p>
        <h2 className="hhero__title">Your match is live</h2>
        <div className="hhero__matches">
          <div className="hhero__match">
            <span className="hhero__match-title">{label}</span>
            {lockedId && (
              <button type="button" className="hhero__play" onClick={() => onPlayRanked(lockedId)}>
                Play Ranked
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (state === 'lock_in_closed') {
    return (
      <section className="hhero hhero--closed" aria-label="Lock-in closed">
        <p className="hhero__eyebrow hhero__eyebrow--live">● LIVE</p>
        <h2 className="hhero__title">Lock-in closed</h2>
        <p className="hhero__sub">
          Matchday {DEMO_MATCHDAY_NUMBER} is underway. You needed to lock in before kickoff.
        </p>
      </section>
    );
  }

  if (state === 'ranked_skipped') {
    const label = rankedStatus.lockedFixtureLabel ?? 'Your match';
    return (
      <section className="hhero hhero--skipped" aria-label="Ranked match not played">
        <p className="hhero__eyebrow">MATCHDAY {DEMO_MATCHDAY_NUMBER}</p>
        <h2 className="hhero__title">{label} finished</h2>
        <p className="hhero__sub">
          You locked in but didn&apos;t play ranked. Lock in again next matchday.
        </p>
      </section>
    );
  }

  if (state === 'live_played') {
    return (
      <section className="hhero hhero--played" aria-label="Ranked match played">
        <p className="hhero__eyebrow">MATCHDAY {DEMO_MATCHDAY_NUMBER}</p>
        <h2 className="hhero__title">You played: {rankedStatus.fixtureLabel}</h2>
        <p className="hhero__points tabular">{rankedStatus.matchPoints}p</p>
        <p className="hhero__sub">Your ranked match points this matchday</p>
        <p className="hhero__hint">
          {matchdayOngoing
            ? 'Your match is done — more fixtures kick off later tonight.'
            : 'Final ranking pending matchday end'}
        </p>
      </section>
    );
  }

  if (state === 'post_matchday' && rankedStatus.played) {
    return (
      <section className="hhero hhero--played" aria-label="Matchday complete">
        <p className="hhero__eyebrow">MATCHDAY {DEMO_MATCHDAY_NUMBER}</p>
        <h2 className="hhero__title">You played: {rankedStatus.fixtureLabel}</h2>
        <p className="hhero__points tabular">{rankedStatus.matchPoints}p</p>
        <p className="hhero__sub">Matchday {DEMO_MATCHDAY_NUMBER} complete</p>
        <p className="hhero__hint">Next matchday: {DEMO_NEXT_MATCHDAY_LABEL}</p>
      </section>
    );
  }

  return (
    <section className="hhero hhero--complete" aria-label="Matchday complete">
      <p className="hhero__eyebrow">MATCHDAY {DEMO_MATCHDAY_NUMBER}</p>
      <h2 className="hhero__title">Matchday {DEMO_MATCHDAY_NUMBER} complete</h2>
      <p className="hhero__sub">Next matchday: {DEMO_NEXT_MATCHDAY_LABEL}</p>
    </section>
  );
}
