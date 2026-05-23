/**
 * ReactionBar — floating React button + popover (saves vertical space).
 */

import { useCallback, useState } from 'react';
import { REACTION_EMOJIS, type ReactionEmoji } from '../sim/watchRoomEngine';
import { useWatchRoom } from '../hooks/useWatchRoom';
import './ReactionBar.css';

export interface ReactionBarProps {
  viewerId: string;
  disabled?: boolean;
  roomId?: string;
  memberIds?: string[];
}

const EMOJI_LABELS: Record<ReactionEmoji, string> = {
  '🔥': 'Fire',
  '⚽': 'Goal',
  '😱': 'Shocked',
  '🎉': 'Celebrate',
};

export function ReactionBar({
  viewerId,
  disabled = false,
  roomId,
  memberIds,
}: ReactionBarProps) {
  const [open, setOpen] = useState(false);
  const { fireReaction } = useWatchRoom(viewerId, { roomId, memberIds });

  const onTap = useCallback(
    (emoji: ReactionEmoji) => {
      if (disabled) return;
      fireReaction(emoji);
      setOpen(false);
    },
    [disabled, fireReaction],
  );

  return (
    <div className={`rxbar ${open ? 'rxbar--open' : ''}`}>
      {open && (
        <div className="rxbar__panel" role="toolbar" aria-label="Pick a reaction">
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
      )}
      <button
        type="button"
        className="rxbar__fab"
        disabled={disabled}
        aria-expanded={open}
        aria-label={open ? 'Close reactions' : 'Send a reaction'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="rxbar__fab-icon" aria-hidden="true">
          {open ? '✕' : '⚡'}
        </span>
        <span className="rxbar__fab-label">React</span>
      </button>
    </div>
  );
}
