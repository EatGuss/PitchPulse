import { HomeUpcomingMatches } from './home/HomeUpcomingMatches';
import { DEMO_MATCHDAY_NUMBER, type MatchdayScheduleContext } from '../domain/matchday';
import type { RankedOpponent } from '../domain/rankedTypes';
import type { Tier } from '../domain/tiers';
import { RankedTierProgress } from './RankedTierProgress';
import './RankedMatchComplete.css';

export interface RankedMatchCompleteProps {
  opponent: RankedOpponent;
  fixtureLabel: string;
  lockedFixtureId: string;
  matchPoints: number;
  opponentPoints: number;
  tier: Tier;
  tierWinsTowardNext: number;
  schedule: MatchdayScheduleContext;
  onContinue: () => void;
}

export function RankedMatchComplete({
  opponent,
  fixtureLabel,
  lockedFixtureId,
  matchPoints,
  opponentPoints,
  tier,
  tierWinsTowardNext,
  schedule,
  onContinue,
}: RankedMatchCompleteProps) {
  const won = matchPoints > opponentPoints;
  const lost = matchPoints < opponentPoints;
  const outcome = won ? 'Victory' : lost ? 'Defeat' : 'Draw';

  return (
    <div className="ranked-done tab-shell" role="main" aria-label="Ranked match complete">
      <div className={`ranked-done__hero ${won ? 'is-win' : lost ? 'is-loss' : ''}`}>
        <p className="ranked-done__eyebrow">FULL TIME · MATCHDAY {DEMO_MATCHDAY_NUMBER}</p>
        <p className={`ranked-done__outcome ${won ? 'is-win' : lost ? 'is-loss' : ''}`}>{outcome}</p>
        <h1 className="ranked-done__title">You played: {fixtureLabel}</h1>
        <p className="ranked-done__points tabular">{matchPoints} pts</p>
        <p className="ranked-done__sub">Your ranked match points · vs {opponent.opponentName} ({opponentPoints} pts)</p>
        <RankedTierProgress tier={tier} tierWinsTowardNext={tierWinsTowardNext} />
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
