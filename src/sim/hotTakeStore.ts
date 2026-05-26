/**
 * Hot Take state — ranked-only, 2 per match (Gate I).
 */

import { TypedEventBus } from './eventBus';

export const HOT_TAKES_PER_RANKED_MATCH = 2;
export const HOT_TAKE_MULTIPLIER = 2.5;

export interface HotTakeSignal {
  matchId: string;
  promptId: string;
  userId: string;
  rivalUserId: string;
  ts: number;
}

interface HotTakeRow {
  remaining: number;
}

const byMatchUser = new Map<string, HotTakeRow>();
const bus = new TypedEventBus<{ changed: undefined; signaled: HotTakeSignal }>();

function key(matchId: string, userId: string): string {
  return `${matchId}#${userId}`;
}

export function initRankedHotTakeState(matchId: string, userId: string): void {
  byMatchUser.set(key(matchId, userId), { remaining: HOT_TAKES_PER_RANKED_MATCH });
  bus.emit('changed', undefined);
}

export function resetHotTakeState(): void {
  byMatchUser.clear();
  bus.emit('changed', undefined);
}

export function getRemainingHotTakes(matchId: string, userId: string): number {
  return byMatchUser.get(key(matchId, userId))?.remaining ?? HOT_TAKES_PER_RANKED_MATCH;
}

export function signalHotTake(signal: HotTakeSignal): boolean {
  const row = byMatchUser.get(key(signal.matchId, signal.userId));
  if (!row || row.remaining <= 0) return false;
  bus.emit('signaled', signal);
  return true;
}

/** Consume one hot take when submitting a vote with hotTake=true. */
export function consumeHotTake(matchId: string, userId: string): boolean {
  const row = byMatchUser.get(key(matchId, userId));
  if (!row || row.remaining <= 0) return false;
  row.remaining -= 1;
  bus.emit('changed', undefined);
  return true;
}

/** Restore one hot take when toggling off before the prompt locks. */
export function refundHotTake(matchId: string, userId: string): void {
  const row = byMatchUser.get(key(matchId, userId));
  if (!row) return;
  if (row.remaining >= HOT_TAKES_PER_RANKED_MATCH) return;
  row.remaining += 1;
  bus.emit('changed', undefined);
}

export function subscribeHotTakeChanged(onChange: () => void): () => void {
  return bus.on('changed', onChange);
}

export function subscribeHotTakeSignaled(onSignal: (signal: HotTakeSignal) => void): () => void {
  return bus.on('signaled', onSignal);
}
