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

/** Demo seed state — mirrors DynamoDB PROFILE items (Gate B). */
const LOCAL_OPPONENTS: Record<DemoUserId, RankedOpponent> = {
  alice: {
    opponentId: 'bob',
    opponentName: DEMO_USERS.bob.displayName,
    opponentTier: 'GOLD',
    opponentTitle: 'Sharpshooter',
  },
  bob: {
    opponentId: 'alice',
    opponentName: DEMO_USERS.alice.displayName,
    opponentTier: 'SILVER',
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

export async function findRankedMatch(userId: DemoUserId): Promise<RankedOpponent> {
  if (!isAwsMode) {
    return LOCAL_OPPONENTS[userId];
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
    opponentTier: match.opponentTier,
    opponentTitle: match.opponentTitle,
  };
}
