/**
 * Half-time trivia overlay state — local engine bus + AWS subscriptions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isAwsMode } from '../aws/config';
import { submitTriviaAnswerAws } from '../aws/triviaBridge';
import { DEMO_USERS, type DemoUserId } from '../data/personas';
import type { TriviaQuestionClient, TriviaScoreEntry, TriviaUiPhase } from '../domain/triviaTypes';
import { getHalfTimeTriviaEngine, TRIVIA_QUESTION_MS } from '../sim/halfTimeTriviaEngine';

export interface UseHalfTimeTriviaResult {
  active: boolean;
  phase: TriviaUiPhase;
  questionIndex: number;
  questions: TriviaQuestionClient[];
  questionDurationMs: number;
  secondsLeft: number;
  scores: TriviaScoreEntry[];
  myPick: string | null;
  locked: boolean;
  revealCorrectId: string | null;
  revealMyPick: string | null;
  completeScores: TriviaScoreEntry[];
  popUserId: string | null;
  submitAnswer: (optionId: string) => void;
  dismissComplete: () => void;
}

function defaultScores(): TriviaScoreEntry[] {
  return Object.keys(DEMO_USERS).map((userId) => ({ userId, triviaPoints: 0 }));
}

export function useHalfTimeTrivia(viewerId: DemoUserId): UseHalfTimeTriviaResult {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<TriviaUiPhase>('question');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questions, setQuestions] = useState<TriviaQuestionClient[]>([]);
  const [questionDurationMs, setQuestionDurationMs] = useState(TRIVIA_QUESTION_MS);
  const [scores, setScores] = useState<TriviaScoreEntry[]>(defaultScores);
  const [myPicks, setMyPicks] = useState<Record<string, string>>({});
  const [locked, setLocked] = useState(false);
  const [revealCorrectId, setRevealCorrectId] = useState<string | null>(null);
  const [revealMyPick, setRevealMyPick] = useState<string | null>(null);
  const [completeScores, setCompleteScores] = useState<TriviaScoreEntry[]>([]);
  const [popUserId, setPopUserId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(10);

  const prevScoresRef = useRef<Record<string, number>>({});
  const myPicksRef = useRef(myPicks);
  myPicksRef.current = myPicks;

  const currentQuestion = questions[questionIndex] ?? null;
  const myPick = currentQuestion ? (myPicks[currentQuestion.questionId] ?? null) : null;

  const resetOverlay = useCallback(() => {
    setActive(false);
    setPhase('question');
    setQuestionIndex(0);
    setQuestions([]);
    setScores(defaultScores());
    setMyPicks({});
    setLocked(false);
    setRevealCorrectId(null);
    setRevealMyPick(null);
    setCompleteScores([]);
    setPopUserId(null);
    prevScoresRef.current = {};
  }, []);

  useEffect(() => {
    const bus = getHalfTimeTriviaEngine().bus;
    return bus.on('triviaStarted', (p) => {
      setActive(true);
      setPhase('question');
      setQuestionIndex(0);
      setQuestions(p.questions);
      setQuestionDurationMs(p.questionDurationMs);
      setScores(defaultScores());
      setMyPicks({});
      setLocked(false);
      setRevealCorrectId(null);
      setRevealMyPick(null);
      prevScoresRef.current = {};
    });
  }, []);

  useEffect(() => {
    const bus = getHalfTimeTriviaEngine().bus;
    return bus.on('triviaScoreUpdated', (p) => {
      for (const s of p.scores) {
        const prev = prevScoresRef.current[s.userId] ?? 0;
        if (s.triviaPoints > prev) {
          setPopUserId(s.userId);
          window.setTimeout(() => setPopUserId(null), 600);
        }
        prevScoresRef.current[s.userId] = s.triviaPoints;
      }
      setScores(p.scores.length > 0 ? p.scores : defaultScores());
    });
  }, []);

  useEffect(() => {
    const bus = getHalfTimeTriviaEngine().bus;
    return bus.on('triviaQuestionClosed', (p) => {
      const pick = myPicksRef.current[p.questionId] ?? null;
      setPhase('reveal');
      setRevealCorrectId(p.correctOptionId);
      setRevealMyPick(pick);
      window.setTimeout(() => {
        setQuestions((qs) => {
          const nextIdx = p.questionNumber;
          if (nextIdx < qs.length) {
            setQuestionIndex(nextIdx);
            setPhase('question');
            setLocked(false);
            setRevealCorrectId(null);
            setRevealMyPick(null);
          }
          return qs;
        });
      }, 1000);
    });
  }, []);

  useEffect(() => {
    const bus = getHalfTimeTriviaEngine().bus;
    return bus.on('triviaCompleted', (p) => {
      setPhase('complete');
      setCompleteScores(p.scores);
    });
  }, []);

  useEffect(() => {
    const bus = getHalfTimeTriviaEngine().bus;
    return bus.on('reset', resetOverlay);
  }, [resetOverlay]);

  useEffect(() => {
    if (!active || phase !== 'question' || !currentQuestion) return;
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((currentQuestion.expiresAt - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => clearInterval(id);
  }, [active, phase, currentQuestion]);

  useEffect(() => {
    if (phase !== 'complete') return;
    const t = window.setTimeout(resetOverlay, 2000);
    return () => clearTimeout(t);
  }, [phase, resetOverlay]);

  const submitAnswer = useCallback(
    (optionId: string) => {
      if (!currentQuestion || locked || phase !== 'question') return;
      setLocked(true);
      setMyPicks((prev) => ({ ...prev, [currentQuestion.questionId]: optionId }));

      void (async () => {
        try {
          if (isAwsMode) {
            await submitTriviaAnswerAws(viewerId, currentQuestion.questionId, optionId);
          } else {
            getHalfTimeTriviaEngine().submitAnswer(
              viewerId,
              currentQuestion.questionId,
              optionId,
            );
          }
        } catch (err) {
          console.error('[trivia] submit failed', err);
          setLocked(false);
        }
      })();
    },
    [currentQuestion, locked, phase, viewerId],
  );

  const dismissComplete = useCallback(() => {
    resetOverlay();
  }, [resetOverlay]);

  return {
    active,
    phase,
    questionIndex,
    questions,
    questionDurationMs,
    secondsLeft,
    scores,
    myPick,
    locked,
    revealCorrectId,
    revealMyPick,
    completeScores,
    popUserId,
    submitAnswer,
    dismissComplete,
  };
}
