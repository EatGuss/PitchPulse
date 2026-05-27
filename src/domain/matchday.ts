/**
 * Matchday schedule + hero state machine (Gate D Home tab).
 * Demo fixture labels follow anonymized match-info team names (Team v Club).
 *
 * Schedule: Team v Club kicks off first (18:30); later fixtures are hours after.
 * Primary fixture follows the shared MatchSim replay; placeholders use wall-clock
 * offsets from sim kickoff for Live / FT badges in the upcoming list.
 */

import { getMatchTeamNames } from '../data/teamAliases';
import type { MatchPhase } from './types';

export type MatchdayHeroState =
  | 'upcoming'
  | 'locked_in'
  | 'live_not_played'
  | 'lock_in_closed'
  | 'live_played'
  | 'ranked_skipped'
  | 'post_matchday';

export type FixtureSchedulePhase = 'soon' | 'live' | 'ft';

export interface MatchdayFixture {
  id: string;
  homeLabel: string;
  guestLabel: string;
  kickoffLabel: string;
  isPlaceholder?: boolean;
}

export const DEMO_MATCHDAY_NUMBER = 30;

/** Server-side ranked matchday key (Gate E). */
export const DEMO_MATCHDAY_ID = String(DEMO_MATCHDAY_NUMBER);

/** Hours after the primary kickoff (sim anchor). */
export const FIXTURE_KICKOFF_OFFSET_H: Record<string, number> = {
  'DFL-MAT-000001': 0,
  'placeholder-1': 3,
  'placeholder-2': 5,
};

/** Approximate full-time after kickoff for placeholder wall-clock windows. */
export const FIXTURE_MATCH_DURATION_MS = 105 * 60 * 1000;

export const DEMO_PRIMARY_FIXTURE: MatchdayFixture = {
  id: 'DFL-MAT-000001',
  homeLabel: 'Team',
  guestLabel: 'Club',
  kickoffLabel: 'Sat 18:30',
};

export const DEMO_MATCHDAY_FIXTURES: MatchdayFixture[] = [
  DEMO_PRIMARY_FIXTURE,
  {
    id: 'placeholder-1',
    homeLabel: 'Leipzig',
    guestLabel: 'Leverkusen',
    kickoffLabel: 'Sat 21:30',
    isPlaceholder: true,
  },
  {
    id: 'placeholder-2',
    homeLabel: 'Frankfurt',
    guestLabel: 'Stuttgart',
    kickoffLabel: 'Sat 23:30',
    isPlaceholder: true,
  },
];

export const DEMO_NEXT_MATCHDAY_LABEL = 'Friday 20:30';

export function demoUpcomingCountdown(): { days: number; hours: number; minutes: number } {
  return { days: 2, hours: 14, minutes: 3 };
}

export function formatCountdown(d: number, h: number, m: number): string {
  return `${d}d ${h}h ${String(m).padStart(2, '0')}m`;
}

export function fixtureTitle(f: MatchdayFixture): string {
  return `${f.homeLabel} v ${f.guestLabel}`;
}

export function getFixtureById(fixtureId: string): MatchdayFixture | undefined {
  return DEMO_MATCHDAY_FIXTURES.find((f) => f.id === fixtureId);
}

/** Live title for the replay fixture — reads loaded match-info team names. */
export function demoFixtureDisplayTitle(): string {
  const teams = getMatchTeamNames();
  return `${teams.home.xmlShortName} v ${teams.guest.xmlShortName}`;
}

export function resolveFixtureTitle(f: MatchdayFixture): string {
  if (isDemoFixture(f)) return demoFixtureDisplayTitle();
  return fixtureTitle(f);
}

export function isDemoFixture(f: MatchdayFixture): boolean {
  return f.id === DEMO_PRIMARY_FIXTURE.id;
}

export function fixtureSchedulePhase(
  fixtureId: string,
  clockPhase: MatchPhase,
  isRunning: boolean,
  simKickoffWallMs: number | null,
): FixtureSchedulePhase {
  const fixture = getFixtureById(fixtureId);
  if (!fixture) return 'soon';

  if (isDemoFixture(fixture)) {
    // Primary replay: Live while the feed is running; FT only after whistle (fullTime).
    if (clockPhase === 'fullTime') return 'ft';
    if (clockPhase === 'preMatch' && !isRunning) return 'soon';
    return 'live';
  }

  if (simKickoffWallMs === null) return 'soon';

  const offsetH = FIXTURE_KICKOFF_OFFSET_H[fixtureId] ?? 0;
  const kickoffMs = simKickoffWallMs + offsetH * 60 * 60 * 1000;
  const endMs = kickoffMs + FIXTURE_MATCH_DURATION_MS;
  const now = Date.now();

  if (now >= endMs) return 'ft';
  if (now >= kickoffMs) return 'live';
  return 'soon';
}

export type FixtureBadgeStatus = 'Soon' | 'Live' | 'FT';

export function fixtureScheduleStatus(
  f: MatchdayFixture,
  clockPhase: MatchPhase,
  isRunning: boolean,
  simKickoffWallMs: number | null,
): FixtureBadgeStatus {
  const phase = fixtureSchedulePhase(f.id, clockPhase, isRunning, simKickoffWallMs);
  if (phase === 'live') return 'Live';
  if (phase === 'ft') return 'FT';
  return 'Soon';
}

/** Label when a fixture cannot be selected (ranked lock-in / room pick rules). */
export function fixtureUnavailablePickLabel(
  fixtureId: string,
  schedule: MatchdayScheduleContext,
): string {
  const phase = fixtureSchedulePhase(
    fixtureId,
    schedule.clockPhase,
    schedule.isRunning,
    schedule.simKickoffWallMs,
  );
  if (phase === 'live') return 'Live';
  if (phase === 'ft') return 'Full time';
  return 'Soon';
}

export function anyFixtureLockable(
  clockPhase: MatchPhase,
  isRunning: boolean,
  simKickoffWallMs: number | null,
): boolean {
  return DEMO_MATCHDAY_FIXTURES.some(
    (f) => fixtureSchedulePhase(f.id, clockPhase, isRunning, simKickoffWallMs) === 'soon',
  );
}

export function anyFixtureLive(
  clockPhase: MatchPhase,
  isRunning: boolean,
  simKickoffWallMs: number | null,
): boolean {
  return DEMO_MATCHDAY_FIXTURES.some(
    (f) => fixtureSchedulePhase(f.id, clockPhase, isRunning, simKickoffWallMs) === 'live',
  );
}

export function isFixturePickable(
  fixtureId: string,
  schedule: MatchdayScheduleContext,
): boolean {
  return fixtureSchedulePhase(fixtureId, schedule.clockPhase, schedule.isRunning, schedule.simKickoffWallMs) === 'soon';
}

export function isFixtureRoomPickable(
  fixtureId: string,
  schedule: MatchdayScheduleContext,
): boolean {
  const phase = fixtureSchedulePhase(
    fixtureId,
    schedule.clockPhase,
    schedule.isRunning,
    schedule.simKickoffWallMs,
  );
  return phase === 'soon' || phase === 'live';
}

export function fixtureRoomLiveClock(
  fixtureId: string,
  schedule: MatchdayScheduleContext,
  primaryDisplayClock: string,
): string | null {
  const phase = fixtureSchedulePhase(
    fixtureId,
    schedule.clockPhase,
    schedule.isRunning,
    schedule.simKickoffWallMs,
  );
  if (phase !== 'live') return null;
  const fixture = getFixtureById(fixtureId);
  if (fixture && isDemoFixture(fixture)) return primaryDisplayClock;
  return 'Live';
}

export function isMatchdayComplete(
  clockPhase: MatchPhase,
  isRunning: boolean,
  simKickoffWallMs: number | null,
): boolean {
  return DEMO_MATCHDAY_FIXTURES.every(
    (f) => fixtureSchedulePhase(f.id, clockPhase, isRunning, simKickoffWallMs) === 'ft',
  );
}

export function isMatchdayOngoing(
  clockPhase: MatchPhase,
  isRunning: boolean,
  simKickoffWallMs: number | null,
): boolean {
  return !isMatchdayComplete(clockPhase, isRunning, simKickoffWallMs);
}

export interface MatchdayScheduleContext {
  clockPhase: MatchPhase;
  isRunning: boolean;
  simKickoffWallMs: number | null;
}
