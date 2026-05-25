/**
 * Hot Take — ranked-only vote multiplier + rival signal (Gate I).
 */

import { generateClient } from 'aws-amplify/api';
import { MATCH_ID, isAwsMode } from './config';
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

interface SubscriptionLike<T> {
  subscribe: (handlers: {
    next: (value: { data: T }) => void;
    error?: (err: unknown) => void;
  }) => { unsubscribe: () => void };
}

export async function initRankedHotTakes(matchId: string, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    initRankedHotTakeState(matchId, userId);
  }
  if (!isAwsMode) return;

  const client = generateClient();
  await Promise.all(
    userIds.map((userId) =>
      client.graphql({
        query: INIT_RANKED_HOT_TAKE,
        variables: { userId, matchId },
      }),
    ),
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

  const client = generateClient();
  try {
    await client.graphql({
      query: SUBMIT_VOTE,
      variables: {
        input: { matchId, promptId, userId, optionId, hotTake, rankedMode },
      },
    });
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

  const client = generateClient();
  try {
    await client.graphql({
      query: SIGNAL_HOT_TAKE,
      variables: { input: signal },
    });
  } catch (err) {
    console.warn('[hotTake] signalHotTake AWS sync failed', err);
  }
}

export function subscribeRivalHotTake(
  rivalUserId: string,
  onSignal: (signal: HotTakeSignal) => void,
): () => void {
  const offLocal = subscribeHotTakeSignaled((signal) => {
    if (signal.rivalUserId === rivalUserId) onSignal(signal);
  });

  if (!isAwsMode) return offLocal;

  const client = generateClient();
  const obs = client.graphql({
    query: SUB_RIVAL_HOT_TAKE,
    variables: { rivalUserId },
  }) as unknown as SubscriptionLike<{ rivalHotTakeSignal: HotTakeSignal }>;

  const sub = obs.subscribe({
    next: ({ data }) => {
      const s = data?.rivalHotTakeSignal;
      if (!s) return;
      onSignal({ ...s, ts: Number(s.ts) });
    },
    error: (err) => console.warn('[hotTake] rival subscription error', err),
  });

  return () => {
    offLocal();
    sub.unsubscribe();
  };
}

export { HOT_TAKES_PER_RANKED_MATCH };
