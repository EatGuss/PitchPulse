/**
 * Ranked match completion — completeRankedMatch + local fallback (Gate D).
 */

import { generateClient } from 'aws-amplify/api';
import type { DemoUserId } from '../data/personas';
import type { RankedMatchResult } from '../domain/rankedTypes';
import { isAwsMode } from './config';
import { COMPLETE_RANKED_MATCH } from './operations';
import type { RankedMatchTitleInput } from '../domain/rankedMatchStats';
import {
  localCompleteRankedDrawMatch,
  localCompleteRankedMatch,
  localSyncRankedMatchResult,
} from '../sim/localProfileStore';
import { finalizeRankedDrawMatchTitles, finalizeRankedMatchTitles } from '../sim/titleUnlockEngine';

interface CompleteRankedMatchResponse {
  completeRankedMatch: RankedMatchResult;
}

export async function commitCompleteRankedMatch(
  matchId: string,
  winnerId: DemoUserId,
  loserId: DemoUserId,
  winnerMatchPoints: number,
  loserMatchPoints: number,
  titleStats?: RankedMatchTitleInput,
): Promise<RankedMatchResult> {
  const isDraw = winnerMatchPoints === loserMatchPoints;

  if (!isAwsMode) {
    const result = isDraw
      ? localCompleteRankedDrawMatch(matchId, winnerId, loserId)
      : localCompleteRankedMatch(matchId, winnerId, loserId);
    if (isDraw) {
      finalizeRankedDrawMatchTitles(winnerId, loserId);
    } else {
      finalizeRankedMatchTitles(winnerId, loserId);
    }
    return result;
  }

  const vars = {
    matchId,
    winnerId,
    loserId,
    winnerMatchPoints,
    loserMatchPoints,
    ...(titleStats ?? {}),
  };

  try {
    const client = generateClient();
    const res = (await client.graphql({
      query: COMPLETE_RANKED_MATCH,
      variables: vars,
    })) as { data?: CompleteRankedMatchResponse; errors?: Array<{ message: string }> };

    if (res.errors?.length) {
      throw new Error(res.errors[0]!.message);
    }

    const raw = res.data?.completeRankedMatch;
    if (!raw) throw new Error('completeRankedMatch returned no data');

    const result: RankedMatchResult = {
      ...raw,
      isDraw: raw.isDraw ?? isDraw,
      outcome: raw.outcome ?? (isDraw ? 'DRAW' : null),
    };

    localSyncRankedMatchResult(winnerId, loserId, result);
    return result;
  } catch (err) {
    console.warn('[ranked] completeRankedMatch failed — using local tier logic', err);
    const result = isDraw
      ? localCompleteRankedDrawMatch(matchId, winnerId, loserId)
      : localCompleteRankedMatch(matchId, winnerId, loserId);
    if (isDraw) {
      finalizeRankedDrawMatchTitles(winnerId, loserId);
    } else {
      finalizeRankedMatchTitles(winnerId, loserId);
    }
    return result;
  }
}
