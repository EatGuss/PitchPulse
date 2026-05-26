import { DEMO_USERS, type DemoUserId } from '../../data/personas';
import type { TriviaScoreEntry } from '../../domain/triviaTypes';

export interface TriviaScoreboardProps {
  scores: TriviaScoreEntry[];
  popUserId: string | null;
}

function corner(userId: DemoUserId, scores: TriviaScoreEntry[], popUserId: string | null, side: 'left' | 'right') {
  const user = DEMO_USERS[userId];
  const pts = scores.find((s) => s.userId === userId)?.triviaPoints ?? 0;
  const showPop = popUserId === userId;
  return (
    <div className={`ht-trivia__score-corner ht-trivia__score-corner--${side}`}>
      <span className="ht-trivia__avatar" aria-hidden="true">
        {user.avatar}
      </span>
      <div className="ht-trivia__score-meta">
        <span className="ht-trivia__score-name">{user.displayName}</span>
        <span className="ht-trivia__score-val tabular">
          {pts}p
          {showPop ? <span className="ht-trivia__pop">+100</span> : null}
        </span>
      </div>
    </div>
  );
}

export function TriviaScoreboard({ scores, popUserId }: TriviaScoreboardProps) {
  return (
    <div className="ht-trivia__scores" aria-live="polite">
      {corner('alice', scores, popUserId, 'left')}
      {corner('bob', scores, popUserId, 'right')}
    </div>
  );
}
