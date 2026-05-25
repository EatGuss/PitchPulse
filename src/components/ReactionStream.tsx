/**
 * ReactionStream — transparent overlay that renders floating emoji puffs each
 * time a reaction is broadcast to the watch room.
 *
 * Both phones subscribe to the same WatchRoomEngine, so a tap on Alice's phone
 * paints a puff on Bob's phone in the same tick (the multiplayer pillar made
 * visible). Puffs auto-evict after their CSS animation finishes.
 *
 * pointer-events: none — the overlay never blocks the EventFeed or PromptSheet.
 */

import { useEffect, useRef, useState } from 'react';
import { DEMO_USERS } from '../data/personas';
import { teamAlias } from '../data/teamAliases';
import { getWatchRoomEngine, type ReactionEvent } from '../sim/watchRoomEngine';
import './ReactionStream.css';

/** A reaction that's currently being animated. `lane` distributes puffs horizontally. */
interface Puff extends ReactionEvent {
  lane: number;
}

/** Match the CSS animation duration so we evict at the right moment. */
const PUFF_TTL_MS = 2200;
/** Cap concurrent puffs so a button-spammer doesn't melt the renderer. */
const MAX_PUFFS = 12;
const LANE_COUNT = 5;

export interface ReactionStreamProps {
  hidden?: boolean;
}

export function ReactionStream({ hidden = false }: ReactionStreamProps) {
  const room = getWatchRoomEngine();
  const [puffs, setPuffs] = useState<Puff[]>([]);
  const laneCursor = useRef(0);

  useEffect(() => {
    if (hidden) return;
    const off = room.bus.on('reaction', ({ reaction }) => {
      const lane = laneCursor.current++ % LANE_COUNT;
      setPuffs((cur) => {
        const next = [...cur, { ...reaction, lane }];
        return next.length > MAX_PUFFS ? next.slice(-MAX_PUFFS) : next;
      });
      // Evict after animation completes — keeps the DOM small.
      setTimeout(() => {
        setPuffs((cur) => cur.filter((p) => p.id !== reaction.id));
      }, PUFF_TTL_MS);
    });
    const offReset = room.bus.on('reset', () => setPuffs([]));
    return () => {
      off();
      offReset();
    };
  }, [room, hidden]);

  if (hidden) return null;

  return (
    <div className="rxstream" aria-hidden="true">
      {puffs.map((p) => {
        const user = DEMO_USERS[p.userId];
        const team = teamAlias(user?.favoriteTeamId);
        // Lane is a 0..LANE_COUNT-1 index. Spread evenly across 15%..85% of width.
        const leftPct = 15 + (p.lane * 70) / Math.max(1, LANE_COUNT - 1);
        return (
          <div
            key={p.id}
            className="rxstream__puff"
            style={{
              left: `${leftPct}%`,
              // Tint via team accent so it's obvious who reacted.
              ['--rx-tint' as string]: team.accent,
            }}
          >
            <span className="rxstream__emoji" aria-hidden="true">{p.emoji}</span>
            <span className="rxstream__who" aria-hidden="true">
              <span className="rxstream__avatar">{user?.avatar ?? '👤'}</span>
              {user?.displayName ?? p.userId}
            </span>
          </div>
        );
      })}
    </div>
  );
}
