import type { TriviaQuestionClient } from '../../domain/triviaTypes';

export interface TriviaQuestionProps {
  question: TriviaQuestionClient;
  questionIndex: number;
  totalQuestions: number;
  secondsLeft: number;
  questionDurationMs: number;
  myPick: string | null;
  locked: boolean;
  phase: 'question' | 'reveal';
  revealCorrectId: string | null;
  revealMyPick: string | null;
  onPick: (optionId: string) => void;
}

export function TriviaQuestion({
  question,
  questionIndex,
  totalQuestions,
  secondsLeft,
  questionDurationMs,
  myPick,
  locked,
  phase,
  revealCorrectId,
  revealMyPick,
  onPick,
}: TriviaQuestionProps) {
  const warn = secondsLeft <= 3 && phase === 'question';
  const pct = Math.min(100, (secondsLeft / (questionDurationMs / 1000)) * 100);

  return (
    <>
      <header className="ht-trivia__head">
        <p className="ht-trivia__title">Half-time trivia</p>
        <p className="ht-trivia__sub">
          Question {questionIndex + 1} of {totalQuestions}
        </p>
      </header>

      <div className="ht-trivia__timer-row">
        <div className="ht-trivia__timer-bar" aria-hidden="true">
          <div
            className={`ht-trivia__timer-fill ${warn ? 'ht-trivia__timer-fill--warn' : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div
          className={`ht-trivia__timer-num ${warn ? 'ht-trivia__timer-num--warn' : ''}`}
          aria-live="polite"
        >
          {secondsLeft}
        </div>
      </div>

      <div className="ht-trivia__body">
        <h2 className="ht-trivia__question">{question.text}</h2>
        <div className="ht-trivia__grid" role="group" aria-label="Answer options">
          {question.options.map((opt) => {
            const picked = myPick === opt.id;
            const dim = locked && !picked && phase === 'question';
            const isCorrect = phase === 'reveal' && revealCorrectId === opt.id;
            const isWrong = phase === 'reveal' && revealMyPick === opt.id && revealMyPick !== revealCorrectId;
            let cls = 'ht-trivia__opt';
            if (picked && phase === 'question') cls += ' ht-trivia__opt--picked';
            if (dim) cls += ' ht-trivia__opt--dim';
            if (isCorrect) cls += ' ht-trivia__opt--correct';
            if (isWrong) cls += ' ht-trivia__opt--wrong';

            return (
              <button
                key={opt.id}
                type="button"
                className={cls}
                disabled={locked || phase === 'reveal'}
                onClick={() => onPick(opt.id)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {phase === 'reveal' && questionIndex + 1 < totalQuestions ? (
          <p className="ht-trivia__reveal-hint">Q{questionIndex + 2} in 1…</p>
        ) : null}
      </div>
    </>
  );
}
