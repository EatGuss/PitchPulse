/**
 * Ranked matchday lock-in + status — local store with AWS sync (Gate E).
 */

import type { DemoUserId } from '../data/personas';
import { DEMO_MATCHDAY_ID, type MatchdayScheduleContext } from '../domain/matchday';
import {
  getUserRankedMatchdayStatus,
  hydrateRankedMatchdayStatus,
  lockInRankedFixture,
} from '../sim/matchdayStore';
import { isAwsMode } from './config';
import { LOCK_IN_RANKED_MATCH, RANKED_MATCHDAY_STATUS } from './operations';
import { gql } from './session';

interface RankedMatchdayStatusPayload {
  matchdayId: string;
  lockedFixtureId: string | null;
  lockedFixtureLabel: string | null;
  played: boolean;
  matchPoints: number | null;
}

interface RankedMatchdayStatusResponse {
  rankedMatchdayStatus: RankedMatchdayStatusPayload;
}

interface LockInRankedResponse {
  lockInRankedMatch: RankedMatchdayStatusPayload;
}

function isFreshRankedSession(userId: DemoUserId): boolean {
  const local = getUserRankedMatchdayStatus(userId);
  return !local.played && !local.lockedFixtureId && local.matchPoints === 0;
}

/** Passive sync (Home/Compete mount) — never import stale played/points from DynamoDB. */
function applyPassiveRankedSync(userId: DemoUserId, status: RankedMatchdayStatusPayload): void {
  const local = getUserRankedMatchdayStatus(userId);

  if (isFreshRankedSession(userId)) {
    return;
  }

  if (local.played) {
    hydrateRankedMatchdayStatus(userId, {
      lockedFixtureId: status.lockedFixtureId ?? local.lockedFixtureId,
      lockedFixtureLabel: status.lockedFixtureLabel ?? local.lockedFixtureLabel,
      fixtureLabel: local.fixtureLabel,
      played: true,
      matchPoints: local.matchPoints,
    });
    return;
  }

  hydrateRankedMatchdayStatus(userId, {
    lockedFixtureId: status.lockedFixtureId,
    lockedFixtureLabel: status.lockedFixtureLabel,
    played: false,
    matchPoints: 0,
    fixtureLabel: status.lockedFixtureLabel ?? local.fixtureLabel ?? '',
  });
}

/** After lock-in mutation — trust server lock fields; played must stay false. */
function applyLockInResponse(userId: DemoUserId, status: RankedMatchdayStatusPayload): void {
  hydrateRankedMatchdayStatus(userId, {
    lockedFixtureId: status.lockedFixtureId,
    lockedFixtureLabel: status.lockedFixtureLabel,
    played: false,
    matchPoints: 0,
    fixtureLabel: status.lockedFixtureLabel ?? '',
  });
}

export async function syncRankedMatchdayFromServer(userId: DemoUserId): Promise<void> {
  if (!isAwsMode) return;

  const res = await gql<RankedMatchdayStatusResponse>(userId, RANKED_MATCHDAY_STATUS, {
    matchdayId: DEMO_MATCHDAY_ID,
  });

  const status = res.data?.rankedMatchdayStatus;
  if (!status) return;
  applyPassiveRankedSync(userId, status);
}

export async function commitLockInRanked(
  userId: DemoUserId,
  fixtureId: string,
  fixtureLabel: string,
  schedule: MatchdayScheduleContext,
): Promise<boolean> {
  if (!lockInRankedFixture(userId, fixtureId, fixtureLabel, schedule)) {
    return false;
  }

  if (!isAwsMode) return true;

  try {
    await syncAwsLockIn(userId, fixtureId, fixtureLabel);
  } catch (err) {
    console.warn('[ranked] lock-in AWS sync failed — local lock-in kept for demo', err);
  }
  return true;
}

/** Best-effort push of local lock-in to DynamoDB before matchmaking. */
export async function syncAwsLockIn(
  userId: DemoUserId,
  fixtureId: string,
  fixtureLabel: string,
): Promise<void> {
  if (!isAwsMode) return;

  const res = await gql<LockInRankedResponse>(userId, LOCK_IN_RANKED_MATCH, {
    input: { matchdayId: DEMO_MATCHDAY_ID, fixtureId, fixtureLabel },
  });

  if (res.errors?.length) {
    throw new Error(res.errors[0]!.message);
  }

  const status = res.data?.lockInRankedMatch;
  if (status) applyLockInResponse(userId, status);
}

export async function ensureAwsLockInSynced(
  userId: DemoUserId,
): Promise<void> {
  const local = getUserRankedMatchdayStatus(userId);
  if (!local.lockedFixtureId || !local.lockedFixtureLabel) return;
  try {
    await syncAwsLockIn(userId, local.lockedFixtureId, local.lockedFixtureLabel);
  } catch (err) {
    console.warn('[ranked] ensureAwsLockInSynced', err);
  }
}
