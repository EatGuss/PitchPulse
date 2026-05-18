/**
 * MatchHeader — competition strip + score chip + match clock.
 * Pure presentational: receives state from MatchSim subscriber.
 */

import { teamAlias } from '../data/teamAliases';
import type { MatchClockState, MatchInfo } from '../domain/types';
import './MatchHeader.css';

export interface MatchHeaderProps {
  info: MatchInfo;
  clock: MatchClockState;
}

function phaseLabel(phase: MatchClockState['phase']): string {
  switch (phase) {
    case 'preMatch': return 'Pre-match';
    case 'firstHalf': return '1st Half';
    case 'halfTime': return 'Half time';
    case 'secondHalf': return '2nd Half';
    case 'fullTime': return 'Full time';
  }
}

export function MatchHeader({ info, clock }: MatchHeaderProps) {
  const home = teamAlias(info.teams.home.id);
  const guest = teamAlias(info.teams.guest.id);
  const isLive = clock.isRunning && clock.phase !== 'preMatch' && clock.phase !== 'fullTime';

  return (
    <header className="mhdr">
      <div className="mhdr__crumb">
        <span>{info.competitionName.toUpperCase()}</span>
        <span className="mhdr__dot" aria-hidden="true">·</span>
        <span>MATCHDAY {info.matchDay}</span>
      </div>

      <div className="mhdr__scorecard">
        <div className="mhdr__team mhdr__team--home">
          <div className="mhdr__team-code" style={{ color: home.accent }}>{home.code}</div>
          <div className="mhdr__team-name">{home.short}</div>
        </div>

        <div className="mhdr__score tabular" aria-live="polite" aria-label={`Score ${clock.score.home} to ${clock.score.guest}`}>
          <span>{clock.score.home}</span>
          <span className="mhdr__score-sep">–</span>
          <span>{clock.score.guest}</span>
        </div>

        <div className="mhdr__team mhdr__team--guest">
          <div className="mhdr__team-code" style={{ color: guest.accent }}>{guest.code}</div>
          <div className="mhdr__team-name">{guest.short}</div>
        </div>
      </div>

      <div className="mhdr__clockbar">
        <span className={`mhdr__livedot ${isLive ? 'is-live' : ''}`} aria-hidden="true" />
        <span className="mhdr__clock tabular">{clock.displayClock}</span>
        <span className="mhdr__phase">{phaseLabel(clock.phase)}</span>
      </div>
    </header>
  );
}
