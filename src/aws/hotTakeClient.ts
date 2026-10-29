/**
 * Hot Take — ranked-only vote multiplier + rival signal (Gate I).
 */

import { MATCH_ID, isAwsMode } from './config';
import { VIEWER, gql, gqlSubscribe, type SessionUser } from './session';
import {
  INIT_RANKED_HOT_TAKE,
  SIGNAL_HOT_TAKE,
  SUBMIT_VOTE,
  SUB_RIVAL_HOT_TAKE,
} from './operations';
import {
  HOT_TAKES_PER_RANKED_MATCH,
  type HotTakeSignal,
  initRankedHotTakeState,
  signalHotTake as localSignalHotTake,
  subscribeHotTakeSignaled,
} from '../sim/hotTakeStore';

export async function initRankedHotTakes(matchId: string, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    initRankedHotTakeState(matchId, userId);
  }
  if (!isAwsMode) return;

  // Each player initialises their own budget; the server acts as the token's user.
  await Promise.all(
    userIds.map((userId) => gql(userId as SessionUser, INIT_RANKED_HOT_TAKE, { matchId })),
  );
}

export async function syncSubmitVote(
  promptId: string,
  userId: string,
  optionId: string,
  hotTake: boolean,
  rankedMode: boolean,
  matchId: string = MATCH_ID,
): Promise<void> {
  if (!isAwsMode) return;

  try {
    const res = await gql(userId as SessionUser, SUBMIT_VOTE, {
      input: { matchId, promptId, optionId, hotTake, rankedMode },
    });
    if (res.errors?.length) throw new Error(res.errors[0]!.message);
  } catch (err) {
    console.warn('[hotTake] submitVote AWS sync failed', err);
  }
}

export async function syncSignalHotTake(
  promptId: string,
  userId: string,
  rivalUserId: string,
  matchId: string = MATCH_ID,
): Promise<void> {
  const signal: HotTakeSignal = {
    matchId,
    promptId,
    userId,
    rivalUserId,
    ts: Date.now(),
  };
  localSignalHotTake(signal);

  if (!isAwsMode) return;

  try {
    const res = await gql(userId as SessionUser, SIGNAL_HOT_TAKE, {
      input: { matchId, promptId, rivalUserId },
    });
    if (res.errors?.length) throw new Error(res.errors[0]!.message);
  } catch (err) {
    console.warn('[hotTake] signalHotTake AWS sync failed', err);
  }
}

export function subscribeRivalHotTake(
  rivalUserId: string,
  onSignal: (signal: HotTakeSignal) => void,
): () => void {
  const offLocal = subscribeHotTakeSignaled((signal) => {
    if (signal.userId === rivalUserId) onSignal(signal);
  });

  if (!isAwsMode) return offLocal;

  const offAws = gqlSubscribe<{ rivalHotTakeSignal: HotTakeSignal }>(
    VIEWER,
    SUB_RIVAL_HOT_TAKE,
    { rivalUserId },
    {
      next: (data) => {
        const s = data?.rivalHotTakeSignal;
        if (!s) return;
        onSignal({ ...s, ts: Number(s.ts) });
      },
      error: (err) => console.warn('[hotTake] rival subscription error', err),
    },
  );

  return () => {
    offLocal();
    offAws();
  };
}

export { HOT_TAKES_PER_RANKED_MATCH };
