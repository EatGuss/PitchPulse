/**
 * AppSync trivia subscriptions → local trivia bus (AWS mode).
 */

import { generateClient } from 'aws-amplify/api';
import { MATCH_ID, isAwsMode } from './config';
import {
  SUBMIT_TRIVIA_ANSWER,
  SUB_TRIVIA_COMPLETED,
  SUB_TRIVIA_QUESTION_CLOSED,
  SUB_TRIVIA_SCORE_UPDATED,
  SUB_TRIVIA_STARTED,
} from './operations';
import { getHalfTimeTriviaEngine } from '../sim/halfTimeTriviaEngine';
import { getPromptEngine } from '../sim/promptEngine';

interface SubscriptionLike<T> {
  subscribe: (handlers: {
    next: (value: { data: T }) => void;
    error?: (err: unknown) => void;
  }) => { unsubscribe: () => void };
}

let attached = false;
let unsubscribers: Array<() => void> = [];

export function attachTriviaBridge(): void {
  if (!isAwsMode || attached) return;

  const client = generateClient();
  const bus = getHalfTimeTriviaEngine().bus;

  const startedObs = client.graphql({
    query: SUB_TRIVIA_STARTED,
    variables: { matchId: MATCH_ID },
  }) as unknown as SubscriptionLike<{
    triviaStarted: {
      matchId: string;
      startsAt: number;
      questionDurationMs: number;
      questions: {
        questionId: string;
        questionNumber: number;
        text: string;
        options: { id: string; label: string }[];
        expiresAt: number;
      }[];
    };
  }>;

  const startedSub = startedObs.subscribe({
    next: ({ data }) => {
      if (!data?.triviaStarted) return;
      bus.emit('triviaStarted', data.triviaStarted);
    },
    error: (err) => console.error('[trivia-bridge] triviaStarted error', err),
  });

  const scoreObs = client.graphql({
    query: SUB_TRIVIA_SCORE_UPDATED,
    variables: { matchId: MATCH_ID },
  }) as unknown as SubscriptionLike<{
    triviaScoreUpdated: { matchId: string; scores: { userId: string; triviaPoints: number }[]; updatedAt: number };
  }>;

  const scoreSub = scoreObs.subscribe({
    next: ({ data }) => {
      if (!data?.triviaScoreUpdated) return;
      bus.emit('triviaScoreUpdated', data.triviaScoreUpdated);
    },
    error: (err) => console.error('[trivia-bridge] triviaScoreUpdated error', err),
  });

  const closedObs = client.graphql({
    query: SUB_TRIVIA_QUESTION_CLOSED,
    variables: { matchId: MATCH_ID },
  }) as unknown as SubscriptionLike<{
    triviaQuestionClosed: {
      matchId: string;
      questionNumber: number;
      questionId: string;
      correctOptionId: string;
      correctLabel: string;
      closedAt: number;
    };
  }>;

  const closedSub = closedObs.subscribe({
    next: ({ data }) => {
      if (!data?.triviaQuestionClosed) return;
      bus.emit('triviaQuestionClosed', data.triviaQuestionClosed);
    },
    error: (err) => console.error('[trivia-bridge] triviaQuestionClosed error', err),
  });

  const completedObs = client.graphql({
    query: SUB_TRIVIA_COMPLETED,
    variables: { matchId: MATCH_ID },
  }) as unknown as SubscriptionLike<{
    triviaCompleted: {
      matchId: string;
      scores: { userId: string; triviaPoints: number }[];
      completedAt: number;
    };
  }>;

  const completedSub = completedObs.subscribe({
    next: ({ data }) => {
      if (!data?.triviaCompleted) return;
      const payload = data.triviaCompleted;
      bus.emit('triviaCompleted', payload);
    },
    error: (err) => console.error('[trivia-bridge] triviaCompleted error', err),
  });

  unsubscribers = [
    () => startedSub.unsubscribe(),
    () => scoreSub.unsubscribe(),
    () => closedSub.unsubscribe(),
    () => completedSub.unsubscribe(),
  ];
  attached = true;
  console.info('[trivia-bridge] attached');
}

export function detachTriviaBridge(): void {
  unsubscribers.forEach((u) => {
    try {
      u();
    } catch {
      /* ignore */
    }
  });
  unsubscribers = [];
  attached = false;
}

export async function submitTriviaAnswerAws(
  userId: string,
  questionId: string,
  answer: string,
): Promise<{ correct: boolean; pointsAwarded: number; correctOptionId: string; correctLabel: string }> {
  const client = generateClient();
  const res = (await client.graphql({
    query: SUBMIT_TRIVIA_ANSWER,
    variables: {
      input: { matchId: MATCH_ID, userId, questionId, answer },
    },
  })) as {
    data?: {
      submitTriviaAnswer?: {
        correct: boolean;
        pointsAwarded: number;
        correctOptionId: string;
        correctLabel: string;
      };
    };
  };
  const out = res.data?.submitTriviaAnswer;
  if (!out) throw new Error('submitTriviaAnswer failed');
  if (out.pointsAwarded > 0) {
    getPromptEngine().awardTriviaPoints(userId, out.pointsAwarded);
  }
  return out;
}
