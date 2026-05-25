import { useEffect, useState } from 'react';
import type { DemoUserId } from '../data/personas';
import type { WatchRoomSession } from '../domain/watchRoomTypes';
import { isAwsMode } from '../aws/config';
import {
  localGetActiveRoomForUser,
  subscribeLocalRoomsChanged,
} from '../sim/localRoomStore';
import {
  getMinimizedWatchRoom,
  subscribeMinimizedWatchRoomChanged,
} from '../sim/watchRoomMinimizedStore';

function resolveActiveWatchRoom(userId: DemoUserId): WatchRoomSession | null {
  if (!isAwsMode) {
    const local = localGetActiveRoomForUser(userId);
    if (local) return local;
  }
  return getMinimizedWatchRoom(userId)?.session ?? null;
}

export function useActiveWatchRoom(userId: DemoUserId): WatchRoomSession | null {
  const [room, setRoom] = useState<WatchRoomSession | null>(() => resolveActiveWatchRoom(userId));

  useEffect(() => {
    const refresh = () => setRoom(resolveActiveWatchRoom(userId));
    refresh();
    const offLocal = isAwsMode ? () => {} : subscribeLocalRoomsChanged(refresh);
    const offMinimized = subscribeMinimizedWatchRoomChanged(refresh);
    return () => {
      offLocal();
      offMinimized();
    };
  }, [userId]);

  return room;
}

/** @deprecated Use useActiveWatchRoom — one room per user. */
export function useUserWatchRooms(userId: DemoUserId): WatchRoomSession[] {
  const room = useActiveWatchRoom(userId);
  return room ? [room] : [];
}
