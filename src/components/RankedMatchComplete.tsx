import { HomeUpcomingMatches } from './home/HomeUpcomingMatches';
import { DEMO_MATCHDAY_NUMBER, type MatchdayScheduleContext } from '../domain/matchday';
import type { RankedOpponent } from '../domain/rankedTypes';
import './RankedMatchComplete.css';
export interface RankedMatchCompleteProps {
  opponent: RankedOpponent;
  fixtureLabel: string;
  lockedFixtureId: string;
  matchPoints: number;
  schedule: MatchdayScheduleContext;
  onContinue: () => void;
}

export function RankedMatchComplete({
  opponent,
  fixtureLabel,
  lockedFixtureId,
  matchPoints,
  schedule,
  onContinue,
}: RankedMatchCompleteProps) {
  return (
    <div className="ranked-done tab-shell" role="main" aria-label="Ranked match complete">
      <div className="ranked-done__hero">
        <p className="ranked-done__eyebrow">FULL TIME · MATCHDAY {DEMO_MATCHDAY_NUMBER}</p>
        <h1 className="ranked-done__title">You played: {fixtureLabel}</h1>
        <p className="ranked-done__points tabular">{matchPoints}p</p>
        <p className="ranked-done__sub">Your ranked match points this matchday</p>
        <p className="ranked-done__vs">
          vs {opponent.opponentName}
        </p>
        <p className="ranked-done__hint">
          Your match is done — more fixtures kick off later tonight.
        </p>
      </div>

      <HomeUpcomingMatches
        schedule={schedule}
        playedFixtureId={lockedFixtureId}
        playedMatchPoints={matchPoints}
      />

      <div className="ranked-done__actions">
        <button type="button" className="ranked-done__cta" onClick={onContinue}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
