/**
 * Client-side matchday + ranked play status for Home hero (Gate D).
 * Gate E adds server-side RANKED_MATCHDAY# enforcement; this mirrors demo UX.
 */

import { TypedEventBus } from './eventBus';
import type { DemoUserId } from '../data/personas';
import {
  anyFixtureLive,
  anyFixtureLockable,
  fixtureSchedulePhase,
  isMatchdayComplete,
  type MatchdayHeroState,
  type MatchdayScheduleContext,
} from '../domain/matchday';
import { demoFixtureDisplayTitle } from '../domain/matchday';
import type { MatchPhase } from '../domain/types';
import { localAddRankedStandingsPoints } from './localLeaderboardStore';

export interface UserRankedMatchdayStatus {
  lockedFixtureId: string | null;
  lockedFixtureLabel: string | null;
  played: boolean;
  matchPoints: number;
  fixtureLabel: string;
}

interface MatchdayStoreEvents extends Record<string, unknown> {
  changed: undefined;
}

const bus = new TypedEventBus<MatchdayStoreEvents>();

const rankedByUser = new Map<DemoUserId, UserRankedMatchdayStatus>();

function defaultStatus(): UserRankedMatchdayStatus {
  return {
    lockedFixtureId: null,
    lockedFixtureLabel: null,
    played: false,
    matchPoints: 0,
    fixtureLabel: demoFixtureDisplayTitle(),
  };
}

function envHeroOverride(): MatchdayHeroState | null {
  const env = (import.meta as { env?: Partial<ImportMetaEnv> }).env;
  const raw = env?.VITE_HOME_HERO_STATE;
  switch (raw) {
    case 'upcoming':
      return 'upcoming';
    case 'locked':
      return 'locked_in';
    case 'live':
      return 'live_not_played';
    case 'played':
      return 'live_played';
    case 'skipped':
      return 'ranked_skipped';
    case 'complete':
      return 'post_matchday';
    default:
      return null;
  }
}

export function getUserRankedMatchdayStatus(userId: DemoUserId): UserRankedMatchdayStatus {
  return rankedByUser.get(userId) ?? defaultStatus();
}

export function lockInRankedFixture(
  userId: DemoUserId,
  fixtureId: string,
  fixtureLabel: string,
  schedule: MatchdayScheduleContext,
): boolean {
  const current = getUserRankedMatchdayStatus(userId);
  if (current.played) return false;
  if (fixtureSchedulePhase(fixtureId, schedule.clockPhase, schedule.isRunning, schedule.simKickoffWallMs) !== 'soon') {
    return false;
  }
  if (current.lockedFixtureId) {
    const currentPhase = fixtureSchedulePhase(
      current.lockedFixtureId,
      schedule.clockPhase,
      schedule.isRunning,
      schedule.simKickoffWallMs,
    );
    if (currentPhase !== 'soon') return false;
  }
  rankedByUser.set(userId, {
    ...current,
    lockedFixtureId: fixtureId,
    lockedFixtureLabel: fixtureLabel,
  });
  bus.emit('changed', undefined);
  return true;
}

export function canChangeRankedFixture(
  userId: DemoUserId,
  schedule: MatchdayScheduleContext,
): boolean {
  const current = getUserRankedMatchdayStatus(userId);
  if (current.played || !current.lockedFixtureId) return false;
  return (
    fixtureSchedulePhase(
      current.lockedFixtureId,
      schedule.clockPhase,
      schedule.isRunning,
      schedule.simKickoffWallMs,
    ) === 'soon'
  );
}

export function canLockInFixture(
  userId: DemoUserId,
  fixtureId: string,
  schedule: MatchdayScheduleContext,
): boolean {
  const current = getUserRankedMatchdayStatus(userId);
  if (current.played) return false;
  if (fixtureSchedulePhase(fixtureId, schedule.clockPhase, schedule.isRunning, schedule.simKickoffWallMs) !== 'soon') {
    return false;
  }
  if (current.lockedFixtureId === fixtureId) return false;
  if (current.lockedFixtureId) {
    return canChangeRankedFixture(userId, schedule);
  }
  return true;
}

export function canPlayRankedFixture(
  userId: DemoUserId,
  schedule: MatchdayScheduleContext,
): boolean {
  const current = getUserRankedMatchdayStatus(userId);
  if (current.played || !current.lockedFixtureId) return false;
  return (
    fixtureSchedulePhase(
      current.lockedFixtureId,
      schedule.clockPhase,
      schedule.isRunning,
      schedule.simKickoffWallMs,
    ) === 'live'
  );
}

export function recordRankedMatchdayPlay(
  userId: DemoUserId,
  matchPoints: number,
  fixtureLabel: string = demoFixtureDisplayTitle(),
): void {
  const current = getUserRankedMatchdayStatus(userId);
  rankedByUser.set(userId, {
    ...current,
    played: true,
    matchPoints,
    fixtureLabel,
  });
  if (matchPoints > 0) {
    localAddRankedStandingsPoints(userId, matchPoints);
  }
  bus.emit('changed', undefined);
}

export function resetRankedMatchdayPlay(userId?: DemoUserId): void {
  if (userId) {
    rankedByUser.delete(userId);
  } else {
    rankedByUser.clear();
  }
  bus.emit('changed', undefined);
}

/** Merge server or persisted ranked matchday state (Gate E). */
export function hydrateRankedMatchdayStatus(
  userId: DemoUserId,
  patch: Partial<UserRankedMatchdayStatus>,
): void {
  const current = getUserRankedMatchdayStatus(userId);
  rankedByUser.set(userId, { ...current, ...patch });
  bus.emit('changed', undefined);
}

export function subscribeMatchdayStore(onChange: () => void): () => void {
  return bus.on('changed', onChange);
}

export function resolveHeroState(
  clockPhase: MatchPhase,
  isRunning: boolean,
  userStatus: UserRankedMatchdayStatus,
  simKickoffWallMs: number | null,
): MatchdayHeroState {
  const override = envHeroOverride();
  if (override) return override;

  if (userStatus.played) {
    if (isMatchdayComplete(clockPhase, isRunning, simKickoffWallMs)) {
      return 'post_matchday';
    }
    return 'live_played';
  }

  const lockedId = userStatus.lockedFixtureId;
  if (lockedId) {
    const selectedPhase = fixtureSchedulePhase(lockedId, clockPhase, isRunning, simKickoffWallMs);
    if (selectedPhase === 'live') return 'live_not_played';
    if (selectedPhase === 'soon') return 'locked_in';
    if (!userStatus.played) return 'ranked_skipped';
    return 'post_matchday';
  }

  if (anyFixtureLockable(clockPhase, isRunning, simKickoffWallMs)) {
    return 'upcoming';
  }

  if (anyFixtureLive(clockPhase, isRunning, simKickoffWallMs)) {
    return 'lock_in_closed';
  }

  return 'post_matchday';
}

export function isMatchSimLive(clockPhase: MatchPhase, isRunning: boolean): boolean {
  const override = envHeroOverride();
  if (override === 'upcoming' || override === 'locked_in' || override === 'post_matchday' || override === 'lock_in_closed') {
    return false;
  }
  if (override === 'live_not_played' || override === 'live_played') return true;
  return isRunning || (clockPhase !== 'preMatch' && clockPhase !== 'fullTime');
}

export function isPrimaryFixtureLive(clockPhase: MatchPhase, isRunning: boolean): boolean {
  return fixtureSchedulePhase('DFL-MAT-000001', clockPhase, isRunning, null) === 'live';
}
