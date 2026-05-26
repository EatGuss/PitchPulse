/**
 * Ranked mode AppSync client — findRankedMatch mutation.
 * Falls back to demo opponent data when AWS env vars are not set (/demo local).
 */

import { generateClient } from 'aws-amplify/api';
import { DEMO_USERS, type DemoUserId } from '../data/personas';
import type { RankedOpponent } from '../domain/rankedTypes';
import type { Tier } from '../domain/tiers';
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

export async function findRankedMatch(userId: DemoUserId): Promise<RankedOpponent> {
  if (!isAwsMode) {
    return localFindRankedMatch(userId);
  }

  const client = generateClient();
  const res = (await client.graphql({
    query: FIND_RANKED_MATCH,
    variables: { userId },
  })) as { data?: FindRankedMatchResponse };

  const match = res.data?.findRankedMatch;
  if (!match) throw new Error('findRankedMatch returned no data');

  return {
    opponentId: match.opponentId,
    opponentName: match.opponentName,
    opponentTier: resolveDemoOpponentTier(match.opponentId, match.opponentTier),
    opponentTitle: match.opponentTitle,
  };
}
