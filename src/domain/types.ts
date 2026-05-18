/**
 * Shared types for PitchPulse domain models.
 *
 * Wire-format JSON shapes that come out of scripts/parse-match-xml.ts
 * are mirrored here; keep both in sync if you change one.
 */

export type NormalizedEventType =
  | 'kickOff'
  | 'goal'
  | 'shotMissed'
  | 'shotSaved'
  | 'shotBlocked'
  | 'card'
  | 'substitution'
  | 'corner'
  | 'foul'
  | 'offside'
  | 'penalty'
  | 'halfTime'
  | 'fullTime'
  | 'stoppageTimeAnnounced';

export type MatchPhase = 'preMatch' | 'firstHalf' | 'halfTime' | 'secondHalf' | 'fullTime';

export interface NormalizedEvent {
  id: string;
  type: NormalizedEventType;
  matchMinute: number;
  displayMinute: string;
  matchPhase: MatchPhase;
  eventTimeIso: string;
  teamId?: string;
  playerId?: string;
  assistPlayerId?: string;
  cardColor?: 'yellow' | 'yellowRed' | 'red';
  reason?: string;
  scoreAfter?: { home: number; guest: number };
}

export interface PlayerLite {
  id: string;
  shirtNumber: number;
  lastName: string;
  shortName: string;
  starting: boolean;
  position?: string;
}

export interface TeamLite {
  id: string;
  role: 'home' | 'guest';
  xmlName: string;
  xmlShortName: string;
  xmlThreeLetterCode: string;
  players: PlayerLite[];
}

export interface MatchInfo {
  matchId: string;
  competitionName: string;
  season: string;
  matchDay: number;
  plannedKickoffTime: string;
  kickoffTime: string;
  finalResult: string;
  stadium: { name: string; capacity: number; spectators: number };
  teams: { home: TeamLite; guest: TeamLite };
  totalTimeFirstHalfMs: number;
  totalTimeSecondHalfMs: number;
}

export interface EventsFile {
  firstKickoffIso: string;
  secondKickoffIso: string | null;
  events: NormalizedEvent[];
}

/** Live state derived from the sim clock — what the UI subscribes to. */
export interface MatchClockState {
  matchMinute: number;        // floating, monotonically increasing
  displayClock: string;       // "23'", "45+2'", "HT", "FT"
  phase: MatchPhase;
  score: { home: number; guest: number };
  isRunning: boolean;
}
