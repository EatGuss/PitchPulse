import { DEMO_USERS, type DemoUserId } from '../../data/personas';
import type { TriviaScoreEntry } from '../../domain/triviaTypes';

export interface TriviaRoundCompleteProps {
  viewerId: DemoUserId;
  scores: TriviaScoreEntry[];
  onDismiss: () => void;
}

export function TriviaRoundComplete({ viewerId, scores, onDismiss }: TriviaRoundCompleteProps) {
  const mine = scores.find((s) => s.userId === viewerId)?.triviaPoints ?? 0;
  const rivalId = viewerId === 'alice' ? 'bob' : 'alice';
  const theirs = scores.find((s) => s.userId === rivalId)?.triviaPoints ?? 0;
  const rivalName = DEMO_USERS[rivalId].displayName;

  return (
    <div className="ht-trivia__complete" role="dialog" aria-label="Trivia complete">
      <p className="ht-trivia__complete-title">Trivia complete!</p>
      <p className="ht-trivia__complete-line">
        You <strong>{mine}p</strong> — {rivalName} <strong>{theirs}p</strong>
      </p>
      <p className="ht-trivia__complete-line">Total trivia points earned</p>
      <button type="button" className="ht-trivia__complete-tap" onClick={onDismiss}>
        Tap to continue
      </button>
    </div>
  );
}
