/**
 * useWatchRoom — subscribes a component to the WatchRoomEngine's reaction stream.
 *
 * Returns the bounded list of recent reactions (newest-first) and a stable
 * `fireReaction(emoji)` bound to the calling viewer. ReactionStream renders
 * transient puffs off this list, ReactionBar calls fireReaction on tap.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getWatchRoomEngine,
  type ReactionEmoji,
  type ReactionEvent,
} from '../sim/watchRoomEngine';

export interface UseWatchRoomResult {
  reactions: ReactionEvent[];
  /** Fire a reaction as the calling viewer. Returns the emitted event or null on rejection. */
  fireReaction: (emoji: ReactionEmoji) => ReactionEvent | null;
  members: string[];
}

export function useWatchRoom(viewerId: string): UseWatchRoomResult {
  const room = getWatchRoomEngine();
  const [reactions, setReactions] = useState<ReactionEvent[]>(() => room.getReactions());
  const [members, setMembers] = useState<string[]>(() => room.getMembers());

  useEffect(() => {
    // Join on mount so badges that gate on room membership fire correctly.
    room.join(viewerId);
    setMembers(room.getMembers());

    const offs = [
      room.bus.on('reaction', () => setReactions(room.getReactions())),
      room.bus.on('memberJoined', () => setMembers(room.getMembers())),
      room.bus.on('reset', () => setReactions(room.getReactions())),
    ];
    return () => offs.forEach((off) => off());
  }, [room, viewerId]);

  const fireReaction = useCallback(
    (emoji: ReactionEmoji) => room.fireReaction(viewerId, emoji),
    [room, viewerId],
  );

  return { reactions, fireReaction, members };
}
