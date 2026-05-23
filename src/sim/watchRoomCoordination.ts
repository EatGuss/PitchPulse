/**
 * Cross-phone Watch Room coordination within a single browser tab (/demo).
 * Host "Start Match" signals all lobby instances to enter the live match view.
 */

import { TypedEventBus } from './eventBus';

interface MatchStartedPayload {
  roomId: string;
}

const startedRoomIds = new Set<string>();
const bus = new TypedEventBus<{ matchStarted: MatchStartedPayload }>();

export function signalWatchRoomMatchStarted(roomId: string): void {
  if (startedRoomIds.has(roomId)) return;
  startedRoomIds.add(roomId);
  bus.emit('matchStarted', { roomId });
}

export function isWatchRoomMatchStarted(roomId: string): boolean {
  return startedRoomIds.has(roomId);
}

export function subscribeWatchRoomMatchStarted(
  roomId: string,
  onStarted: () => void,
): () => void {
  if (startedRoomIds.has(roomId)) {
    onStarted();
  }
  return bus.on('matchStarted', ({ roomId: id }) => {
    if (id === roomId) onStarted();
  });
}

export function resetWatchRoomCoordination(): void {
  startedRoomIds.clear();
}
