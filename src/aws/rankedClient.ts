/**
 * Ranked mode AppSync client — findRankedMatch mutation.
 * Falls back to demo opponent data when AWS env vars are not set (/demo local),
 * or when AWS is out of sync with local lock-in (common on /demo).
 */

import { generateClient } from 'aws-amplify/api';
import { DEMO_USERS, type DemoUserId } from '../data/personas';
import type { RankedOpponent } from '../domain/rankedTypes';
import type { Tier } from '../domain/tiers';
import { getUserRankedMatchdayStatus } from '../sim/matchdayStore';
import { isAwsMode } from './config';
import { FIND_RANKED_MATCH } from './operations';

/** Narrative tiers for /demo matchmaking reveal (not live AWS PROFILE). */
const DEMO_OPPONENT_SEED_TIER: Record<DemoUserId, Tier> = {
  alice: 'SILVER',
  bob: 'GOLD',
};

/** Demo seed state — mirrors DynamoDB PROFILE items (Gate B). */
const LOCAL_OPPONENTS: Record<DemoUserId, RankedOpponent> = {
  alice: {
    opponentId: 'bob',
    opponentName: DEMO_USERS.bob.displayName,
    opponentTier: DEMO_OPPONENT_SEED_TIER.bob,
    opponentTitle: 'Sharpshooter',
  },
  bob: {
    opponentId: 'alice',
    opponentName: DEMO_USERS.alice.displayName,
    opponentTier: DEMO_OPPONENT_SEED_TIER.alice,
    opponentTitle: 'Sharpshooter',
  },
};

interface FindRankedMatchResponse {
  findRankedMatch: {
    opponentId: string;
    opponentName: string;
    opponentTier: Tier;
    opponentTitle: string | null;
  };
}

function resolveDemoOpponentTier(opponentId: string, fallback: Tier): Tier {
  if (opponentId in DEMO_OPPONENT_SEED_TIER) {
    return DEMO_OPPONENT_SEED_TIER[opponentId as DemoUserId];
  }
  return fallback;
}

function localFindRankedMatch(userId: DemoUserId): RankedOpponent {
  return LOCAL_OPPONENTS[userId];
}

function localMatchmakingAllowed(userId: DemoUserId): boolean {
  const s = getUserRankedMatchdayStatus(userId);
  return Boolean(s.lockedFixtureId) && !s.played;
}

function graphqlErrorMessage(res: { errors?: Array<{ message: string }> }): string | null {
  return res.errors?.[0]?.message ?? null;
}

export async function findRankedMatch(userId: DemoUserId): Promise<RankedOpponent> {
  if (!isAwsMode) {
    return localFindRankedMatch(userId);
  }

  if (!localMatchmakingAllowed(userId)) {
    const s = getUserRankedMatchdayStatus(userId);
    if (!s.lockedFixtureId) {
      throw new Error('Lock in a ranked match before matchmaking');
    }
    throw new Error('You already played your ranked match this matchday');
  }

  try {
    const client = generateClient();
    const res = (await client.graphql({
      query: FIND_RANKED_MATCH,
      variables: { userId },
    })) as { data?: FindRankedMatchResponse; errors?: Array<{ message: string }> };

    const gqlErr = graphqlErrorMessage(res);
    if (gqlErr) throw new Error(gqlErr);

    const match = res.data?.findRankedMatch;
    if (!match) throw new Error('findRankedMatch returned no data');

    return {
      opponentId: match.opponentId,
      opponentName: match.opponentName,
      opponentTier: resolveDemoOpponentTier(match.opponentId, match.opponentTier),
      opponentTitle: match.opponentTitle,
    };
  } catch (err) {
    if (localMatchmakingAllowed(userId)) {
      console.warn('[ranked] findRankedMatch AWS failed — using demo opponent', err);
      return localFindRankedMatch(userId);
    }
    throw err;
  }
}
