/**
 * PromptCommentThread — Watch Room comment thread below the prompt card.
 * Plain text only, 140 chars, no @ mentions. Read-only once prompt resolves.
 */

import { DEMO_USERS, type DemoUserId } from '../data/personas';
import type { PromptInstance } from '../domain/promptTypes';
import { MAX_COMMENT_LEN } from '../domain/watchRoomTypes';
import type { RoomMember } from '../domain/watchRoomTypes';
import { usePromptComments } from '../hooks/usePromptComments';
import './PromptCommentThread.css';

export interface PromptCommentThreadProps {
  roomId: string;
  prompt: PromptInstance;
  viewerId: string;
  members: RoomMember[];
}

function displayName(userId: string, members: RoomMember[]): string {
  return (
    members.find((m) => m.userId === userId)?.displayName ??
    DEMO_USERS[userId as DemoUserId]?.displayName ??
    userId
  );
}

export function PromptCommentThread({
  roomId,
  prompt,
  viewerId,
  members,
}: PromptCommentThreadProps) {
  const readOnly = prompt.state === 'resolved';
  const {
    comments,
    expanded,
    setExpanded,
    draft,
    setDraft,
    error,
    posting,
    postComment,
    clearError,
  } = usePromptComments(roomId, prompt.id, viewerId, readOnly);

  const remaining = MAX_COMMENT_LEN - draft.length;

  const onSend = () => {
    void postComment();
  };

  const onDraftChange = (value: string) => {
    if (error) clearError();
    setDraft(value.slice(0, MAX_COMMENT_LEN));
  };

  return (
    <div className={`pct ${expanded ? 'pct--open' : 'pct--collapsed'}`}>
      <button
        type="button"
        className="pct__toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="pct__toggle-label">Comments</span>
        <span className="pct__toggle-count tabular">{comments.length}</span>
        <span className="pct__toggle-chev" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <div className="pct__body">
          <ul className="pct__list" aria-live="polite">
            {comments.length === 0 ? (
              <li className="pct__empty">No comments yet — say something to the room.</li>
            ) : (
              comments.map((c) => (
                <li key={c.commentId} className={`pct__row ${c.userId === viewerId ? 'is-me' : ''}`}>
                  <span className="pct__author">{displayName(c.userId, members)}</span>
                  <span className="pct__text">{c.text}</span>
                </li>
              ))
            )}
          </ul>

          {readOnly ? (
            <p className="pct__closed">Thread closed — prompt resolved.</p>
          ) : (
            <div className="pct__composer">
              <input
                type="text"
                className="pct__input"
                value={draft}
                placeholder="Add a comment…"
                maxLength={MAX_COMMENT_LEN}
                aria-label="Comment text"
                disabled={posting}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSend();
                  }
                }}
              />
              <div className="pct__composer-foot">
                <span className={`pct__counter tabular ${remaining <= 20 ? 'is-low' : ''}`}>
                  {remaining}
                </span>
                <button
                  type="button"
                  className="pct__send"
                  disabled={posting || draft.trim().length === 0}
                  onClick={onSend}
                >
                  Send
                </button>
              </div>
              {error && (
                <p className="pct__error" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
