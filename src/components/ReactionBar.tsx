/**
 * ReactionBar — four full-width tap targets emitting room-wide reactions.
 *
 * Sits just above the BottomTabBar inside each phone. Tapping fires a
 * reaction through WatchRoomEngine.fireReaction(); both phones render the
 * resulting puff via ReactionStream because they share the singleton.
 *
 * Tap targets are 44px tall (spec §8.2). The bar uses the same translucent
 * blurred-glass surface as the tab bar so the two read as a cohesive bottom
 * stack rather than two competing rows.
 */

import { useCallback } from 'react';
import { REACTION_EMOJIS, type ReactionEmoji } from '../sim/watchRoomEngine';
import { useWatchRoom } from '../hooks/useWatchRoom';
import './ReactionBar.css';

export interface ReactionBarProps {
  viewerId: string;
  /** Optional disabled state — used when the match isn't running yet. */
  disabled?: boolean;
}

const EMOJI_LABELS: Record<ReactionEmoji, string> = {
  '🔥': 'Fire',
  '⚽': 'Goal',
  '😱': 'Shocked',
  '🎉': 'Celebrate',
};

export function ReactionBar({ viewerId, disabled = false }: ReactionBarProps) {
  const { fireReaction } = useWatchRoom(viewerId);

  const onTap = useCallback(
    (emoji: ReactionEmoji) => {
      if (disabled) return;
      fireReaction(emoji);
    },
    [disabled, fireReaction],
  );

  return (
    <div className="rxbar" role="toolbar" aria-label="Send a reaction to the watch room">
      <div className="rxbar__label">React</div>
      <div className="rxbar__row">
        {REACTION_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            className="rxbar__btn"
            disabled={disabled}
            aria-label={EMOJI_LABELS[e]}
            onClick={() => onTap(e)}
          >
            <span aria-hidden="true">{e}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
