import { useState } from 'react';
import {
  DEMO_MATCHDAY_FIXTURES,
  fixtureScheduleStatus,
  resolveFixtureTitle,
  type MatchdayScheduleContext,
} from '../../domain/matchday';
import { useMatchData } from '../../hooks/useMatchData';
import './HomeUpcomingMatches.css';

export interface HomeUpcomingMatchesProps {
  schedule: MatchdayScheduleContext;
  playedFixtureId?: string | null;
  playedMatchPoints?: number | null;
}

export function HomeUpcomingMatches({
  schedule,
  playedFixtureId = null,
  playedMatchPoints = null,
}: HomeUpcomingMatchesProps) {
  const [expanded, setExpanded] = useState(false);
  const { ready } = useMatchData();
  void ready;

  const userPlayed = playedFixtureId !== null;
  const title = userPlayed ? 'Rest of matchday' : 'Upcoming Matches';

  return (
    <section
      className={`hupcoming${expanded ? ' hupcoming--expanded' : ''}`}
      aria-label={title}
    >
      <h2 className="hupcoming__title">{title}</h2>
      {userPlayed && (
        <p className="hupcoming__lead">Your match is finished — later kickoffs are still to come.</p>
      )}
      <div className="hupcoming__body">
        <div className="hupcoming__list-wrap">
          <ul className="hupcoming__list">
            {DEMO_MATCHDAY_FIXTURES.map((f) => {
              const status = fixtureScheduleStatus(
                f,
                schedule.clockPhase,
                schedule.isRunning,
                schedule.simKickoffWallMs,
              );
              const isUserMatch = playedFixtureId === f.id;
              return (
                <li
                  key={f.id}
                  className={`hupcoming__row${isUserMatch ? ' hupcoming__row--yours' : ''}`}
                >
                  <div className="hupcoming__row-main">
                    <span className="hupcoming__fixture">{resolveFixtureTitle(f)}</span>
                    <span className="hupcoming__kickoff">{f.kickoffLabel}</span>
                    {isUserMatch && playedMatchPoints !== null && (
                      <span className="hupcoming__yours tabular">You · {playedMatchPoints}p</span>
                    )}
                  </div>
                  <span
                    className={`hupcoming__status hupcoming__status--${status.toLowerCase()}`}
                  >
                    {status}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="hupcoming__fade" aria-hidden="true" />
        </div>
        <button
          type="button"
          className="hupcoming__more"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Show fewer matches' : 'Show all matches'}
        >
          <span
            className={`hupcoming__more-chev${expanded ? ' hupcoming__more-chev--up' : ''}`}
            aria-hidden="true"
          >
            ⌄
          </span>
          <span className="hupcoming__more-label">{expanded ? 'Show less' : 'All matches'}</span>
        </button>
      </div>
    </section>
  );
}
