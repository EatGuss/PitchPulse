/**
 * Ranked match completion — completeRankedMatch + local fallback (Gate D).
 */

import { generateClient } from 'aws-amplify/api';
import type { DemoUserId } from '../data/personas';
import type { RankedMatchResult } from '../domain/rankedTypes';
import { isAwsMode } from './config';
import { COMPLETE_RANKED_MATCH } from './operations';
import type { RankedMatchTitleInput } from '../domain/rankedMatchStats';
import { localCompleteRankedDrawMatch, localCompleteRankedMatch } from '../sim/localProfileStore';
import { finalizeRankedDrawMatchTitles, finalizeRankedMatchTitles } from '../sim/titleUnlockEngine';

interface CompleteRankedMatchResponse {
  completeRankedMatch: RankedMatchResult;
}

/**
 * Settlements already started this session, keyed by match + player pair.
 * On /demo both phone frames reach full time and each calls this function;
 * the second caller must get the first caller's result, not apply it again.
 */
const settlements = new Map<string, Promise<RankedMatchResult>>();

function settlementKey(matchId: string, a: string, b: string): string {
  return `${matchId}#${[a, b].sort().join('|')}`;
}

/** Forget settled matches — called by the demo reset so a replay can settle again. */
export function resetRankedSettlements(): void {
  settlements.clear();
}

export function commitCompleteRankedMatch(
  matchId: string,
  winnerId: DemoUserId,
  loserId: DemoUserId,
  winnerMatchPoints: number,
  loserMatchPoints: number,
  titleStats?: RankedMatchTitleInput,
): Promise<RankedMatchResult> {
  const key = settlementKey(matchId, winnerId, loserId);
  const existing = settlements.get(key);
  if (existing) return existing;
  const pending = settleRankedMatch(
    matchId,
    winnerId,
    loserId,
    winnerMatchPoints,
    loserMatchPoints,
    titleStats,
  );
  settlements.set(key, pending);
  return pending;
}

async function settleRankedMatch(
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

    // Demo profiles use local seed tier (Alice Silver 4/5); DynamoDB may be stale.
    const localResult = isDraw
      ? localCompleteRankedDrawMatch(matchId, winnerId, loserId)
      : localCompleteRankedMatch(matchId, winnerId, loserId);

    const result: RankedMatchResult = {
      ...raw,
      ...localResult,
      isDraw: localResult.isDraw ?? isDraw,
      outcome: localResult.outcome ?? (isDraw ? 'DRAW' : null),
    };

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
