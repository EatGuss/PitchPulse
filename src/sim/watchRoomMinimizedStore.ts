/**
 * Client-side minimized watch room state.
 * AWS mode has no local membership index — this store keeps the session
 * after minimize so Home / Compete entry can show the rejoin card.
 */

import type { WatchRoomSession } from '../domain/watchRoomTypes';
import { TypedEventBus } from './eventBus';

export interface MinimizedWatchRoomState {
  session: WatchRoomSession;
  wasInMatch: boolean;
}

const byUser = new Map<string, MinimizedWatchRoomState>();
const bus = new TypedEventBus<{ changed: undefined }>();

export function setMinimizedWatchRoom(
  userId: string,
  session: WatchRoomSession,
  wasInMatch: boolean,
): void {
  byUser.set(userId, { session, wasInMatch });
  bus.emit('changed', undefined);
}

export function getMinimizedWatchRoom(userId: string): MinimizedWatchRoomState | null {
  return byUser.get(userId) ?? null;
}

export function clearMinimizedWatchRoom(userId: string): void {
  if (!byUser.delete(userId)) return;
  bus.emit('changed', undefined);
}

export function subscribeMinimizedWatchRoomChanged(onChange: () => void): () => void {
  return bus.on('changed', onChange);
}
