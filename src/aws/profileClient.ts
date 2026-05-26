/**
 * Me-tab profile — userStats + equipTitle with local fallback.
 */

import { generateClient } from 'aws-amplify/api';
import type { DemoUserId } from '../data/personas';
import type { MeProfile } from '../domain/profileTypes';
import { normalizeLifetimeAccuracy } from '../domain/accuracy';
import { filterValidUnlockedTitleIds } from '../domain/titleRules';
import { fetchUserStats } from './leaderboardClient';
import { isAwsMode } from './config';
import { EQUIP_TITLE, UNLOCK_HOT_TAKE_HERO } from './operations';
import { notifyLocalTitleUnlock } from './titleUnlockClient';
import {
  localEquipTitle,
  localGetMeProfile,
  localRecordRankedMatchHistory,
  localUnlockTitle,
} from '../sim/localProfileStore';
import { localGetUserStats } from '../sim/localLeaderboardStore';

function buildProfile(userId: DemoUserId, weeklyPoints: number, seasonalPoints: number): MeProfile {
  return localGetMeProfile(userId, weeklyPoints, seasonalPoints);
}

export async function fetchMeProfile(userId: DemoUserId): Promise<MeProfile> {
  try {
    const stats = await fetchUserStats(userId);
    const base = buildProfile(userId, stats.weeklyPoints, stats.seasonalPoints);

    if (!isAwsMode) return base;

    const rankedMatchesPlayed = stats.rankedMatchesPlayed ?? base.rankedMatchesPlayed;
    const lifetimeAccuracy =
      normalizeLifetimeAccuracy(stats.lifetimeAccuracy) ?? base.lifetimeAccuracy;
    const titleStats = {
      totalShots: base.totalShots,
      correctShots: base.correctShots,
      rankedMatchesPlayed,
      unlockedTitleIds: [] as string[],
    };
    const rawUnlocked =
      stats.unlockedTitleIds.length > 0 ? stats.unlockedTitleIds : base.unlockedTitleIds;
    const unlockedTitleIds = filterValidUnlockedTitleIds(titleStats, rawUnlocked);
    const equippedTitleId =
      stats.equippedTitleId && unlockedTitleIds.includes(stats.equippedTitleId)
        ? stats.equippedTitleId
        : base.equippedTitleId && unlockedTitleIds.includes(base.equippedTitleId)
          ? base.equippedTitleId
          : unlockedTitleIds[0] ?? null;

    return {
      ...base,
      // Tier progression matches Home — always from localProfileStore (demo narrative).
      tier: base.tier,
      tierWinsTowardNext: base.tierWinsTowardNext,
      equippedTitleId,
      equippedTitle: equippedTitleId
        ? (stats.equippedTitle ?? base.equippedTitle ?? null)
        : null,
      unlockedTitleIds,
      lifetimeAccuracy,
      rankedMatchesPlayed,
    };
  } catch (err) {
    console.warn('[profile] fetchMeProfile failed — using local demo profile', err);
    const local = localGetUserStats(userId);
    return buildProfile(userId, local.weeklyPoints, local.seasonalPoints);
  }
}

export async function commitEquipTitle(userId: DemoUserId, titleId: string): Promise<boolean> {
  if (!isAwsMode) {
    return localEquipTitle(userId, titleId);
  }

  try {
    const client = generateClient();
    const res = (await client.graphql({
      query: EQUIP_TITLE,
      variables: { userId, titleId },
    })) as { data?: { equipTitle: boolean }; errors?: Array<{ message: string }> };

    if (res.errors?.length) {
      throw new Error(res.errors[0]!.message);
    }

    if (res.data?.equipTitle) {
      localEquipTitle(userId, titleId);
      return true;
    }
  } catch (err) {
    console.warn('[profile] equipTitle AWS failed — trying local', err);
  }

  return localEquipTitle(userId, titleId);
}

export function recordRankedMatchForProfile(
  userId: DemoUserId,
  fixtureLabel: string,
  opponentName: string,
  matchPoints: number,
  opponentPoints: number,
): void {
  localRecordRankedMatchHistory(userId, fixtureLabel, opponentName, matchPoints, opponentPoints);
}

export async function commitUnlockHotTakeHero(userId: DemoUserId): Promise<boolean> {
  const added = localUnlockTitle(userId, 'hot-take-hero');
  if (added) notifyLocalTitleUnlock(userId, 'hot-take-hero');

  if (!isAwsMode) return true;

  try {
    const client = generateClient();
    const res = (await client.graphql({
      query: UNLOCK_HOT_TAKE_HERO,
      variables: { userId },
    })) as { data?: { unlockHotTakeHero: boolean }; errors?: Array<{ message: string }> };

    if (res.errors?.length) {
      throw new Error(res.errors[0]!.message);
    }
    return res.data?.unlockHotTakeHero ?? true;
  } catch (err) {
    console.warn('[profile] unlockHotTakeHero AWS failed — local unlock kept', err);
    return true;
  }
}
