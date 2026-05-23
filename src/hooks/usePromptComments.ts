/**
 * usePromptComments — Watch Room comment thread for the active prompt.
 *
 * Local mode: shared in-memory store + event bus (/demo without AWS env).
 * AWS mode: postComment mutation + roomComment subscription per promptId.
 */

import { useCallback, useEffect, useState } from 'react';
import { postRoomComment, subscribeRoomComments } from '../aws/roomClient';
import type { RoomComment } from '../domain/watchRoomTypes';
import { validateCommentText } from '../domain/watchRoomTypes';

function mergeComment(prev: RoomComment[], next: RoomComment): RoomComment[] {
  if (prev.some((c) => c.commentId === next.commentId)) return prev;
  return [...prev, next].sort((a, b) => a.ts - b.ts);
}

export interface UsePromptCommentsResult {
  comments: RoomComment[];
  expanded: boolean;
  setExpanded: (open: boolean) => void;
  draft: string;
  setDraft: (text: string) => void;
  error: string | null;
  posting: boolean;
  postComment: () => Promise<boolean>;
  clearError: () => void;
}

export function usePromptComments(
  roomId: string | undefined,
  promptId: string | undefined,
  viewerId: string,
  readOnly: boolean,
): UsePromptCommentsResult {
  const [comments, setComments] = useState<RoomComment[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    setComments([]);
    setDraft('');
    setError(null);
    setExpanded(false);
    if (!roomId || !promptId) return;

    return subscribeRoomComments(roomId, promptId, (comment) => {
      setComments((prev) => mergeComment(prev, comment));
    });
  }, [roomId, promptId]);

  const postComment = useCallback(async (): Promise<boolean> => {
    if (!roomId || !promptId || readOnly || posting) return false;

    const validated = validateCommentText(draft);
    if (!validated.ok) {
      setError(validated.error);
      return false;
    }

    setPosting(true);
    setError(null);
    try {
      const comment = await postRoomComment(roomId, promptId, viewerId, validated.text);
      setComments((prev) => mergeComment(prev, comment));
      setDraft('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post comment');
      return false;
    } finally {
      setPosting(false);
    }
  }, [roomId, promptId, viewerId, readOnly, posting, draft]);

  const clearError = useCallback(() => setError(null), []);

  return {
    comments,
    expanded,
    setExpanded,
    draft,
    setDraft,
    error,
    posting,
    postComment,
    clearError,
  };
}
