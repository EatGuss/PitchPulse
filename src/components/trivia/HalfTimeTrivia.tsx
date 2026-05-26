import type { DemoUserId } from '../../data/personas';
import { useHalfTimeTrivia } from '../../hooks/useHalfTimeTrivia';
import { TriviaQuestion } from './TriviaQuestion';
import { TriviaRoundComplete } from './TriviaRoundComplete';
import { TriviaScoreboard } from './TriviaScoreboard';
import './HalfTimeTrivia.css';

export interface HalfTimeTriviaProps {
  viewerId: DemoUserId;
}

export function HalfTimeTrivia({ viewerId }: HalfTimeTriviaProps) {
  const t = useHalfTimeTrivia(viewerId);

  if (!t.active) return null;

  const q = t.questions[t.questionIndex];

  return (
    <div className="ht-trivia" role="dialog" aria-label="Half-time trivia">
      <TriviaScoreboard scores={t.scores} popUserId={t.popUserId} />

      {t.phase === 'complete' ? (
        <TriviaRoundComplete
          viewerId={viewerId}
          scores={t.completeScores}
          onDismiss={t.dismissComplete}
        />
      ) : q ? (
        <TriviaQuestion
          question={q}
          questionIndex={t.questionIndex}
          totalQuestions={t.questions.length}
          secondsLeft={t.secondsLeft}
          questionDurationMs={t.questionDurationMs}
          myPick={t.myPick}
          locked={t.locked}
          phase={t.phase === 'reveal' ? 'reveal' : 'question'}
          revealCorrectId={t.revealCorrectId}
          revealMyPick={t.revealMyPick}
          onPick={t.submitAnswer}
        />
      ) : null}
    </div>
  );
}
