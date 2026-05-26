/**
 * Local half-time trivia — mirrors pp-trivia-handler for /demo (no AWS).
 */

import { MATCH_ID, isAwsMode } from '../aws/config';
import { generateTriviaQuestions } from '../domain/triviaQuestionGenerator';
import type {
  TriviaCompletedPayload,
  TriviaQuestionClient,
  TriviaQuestionClosedPayload,
  TriviaScoreEntry,
  TriviaStartedPayload,
} from '../domain/triviaTypes';
import type { GeneratedQuestion } from '../domain/triviaQuestionGenerator';
import { TypedEventBus } from './eventBus';
import { getMatchSim } from './matchSim';
import { getPromptEngine } from './promptEngine';

export const TRIVIA_QUESTION_MS = 10_000;
const REVEAL_MS = 1_000;
const COMPLETE_CARD_MS = 2_000;
const POINTS_PER_CORRECT = 100;

export interface HalfTimeTriviaEventMap extends Record<string, unknown> {
  triviaStarted: TriviaStartedPayload;
  triviaScoreUpdated: { matchId: string; scores: TriviaScoreEntry[]; updatedAt: number };
  triviaQuestionClosed: TriviaQuestionClosedPayload;
  triviaCompleted: TriviaCompletedPayload;
  reset: void;
}

interface StoredRound {
  matchId: string;
  startsAt: number;
  questions: GeneratedQuestion[];
  clientQuestions: TriviaQuestionClient[];
  scores: Record<string, number>;
  answers: Set<string>;
  status: 'active' | 'completed';
}

let engine: HalfTimeTriviaEngine | null = null;

export class HalfTimeTriviaEngine {
  readonly bus = new TypedEventBus<HalfTimeTriviaEventMap>();
  private round: StoredRound | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private attached = false;

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    const sim = getMatchSim();
    sim.bus.on('event', (ev) => {
      if (ev.type === 'halfTime' && !isAwsMode) {
        void this.startRound(sim.getDeliveredEvents());
      }
    });
    sim.bus.on('reset', () => this.reset());
  }

  reset(): void {
    this.clearTimers();
    this.round = null;
    this.bus.emit('reset', undefined);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  async startRound(events: Parameters<typeof generateTriviaQuestions>[0]): Promise<void> {
    if (this.round?.status === 'active' || this.round?.status === 'completed') return;

    const generated = generateTriviaQuestions(events);
    if (generated.length === 0) return;

    const startsAt = Date.now();
    const clientQuestions: TriviaQuestionClient[] = generated.map((q) => ({
      questionId: q.questionId,
      questionNumber: q.questionNumber,
      text: q.text,
      options: q.options,
      expiresAt: startsAt + q.questionNumber * TRIVIA_QUESTION_MS,
    }));

    this.round = {
      matchId: MATCH_ID,
      startsAt,
      questions: generated,
      clientQuestions,
      scores: {},
      answers: new Set(),
      status: 'active',
    };

    this.bus.emit('triviaStarted', {
      matchId: MATCH_ID,
      startsAt,
      questionDurationMs: TRIVIA_QUESTION_MS,
      questions: clientQuestions,
    });

    this.scheduleRoundTimeline();
  }

  private scheduleRoundTimeline(): void {
    this.clearTimers();
    const round = this.round;
    if (!round) return;

    for (let i = 0; i < round.questions.length; i++) {
      const q = round.questions[i];
      const closeAt = round.startsAt + q.questionNumber * TRIVIA_QUESTION_MS;
      const delay = Math.max(0, closeAt - Date.now());
      this.timers.push(
        setTimeout(() => {
          const correctOption = q.options.find((o) => o.id === q.correctAnswer);
          this.bus.emit('triviaQuestionClosed', {
            matchId: MATCH_ID,
            questionNumber: q.questionNumber,
            questionId: q.questionId,
            correctOptionId: q.correctAnswer,
            correctLabel: correctOption?.label ?? q.correctAnswer,
            closedAt: Date.now(),
          });
        }, delay),
      );
    }

    const completeAt =
      round.startsAt +
      round.questions.length * TRIVIA_QUESTION_MS +
      (round.questions.length - 1) * REVEAL_MS +
      COMPLETE_CARD_MS;

    this.timers.push(
      setTimeout(() => {
        void this.finishRound();
      }, Math.max(0, completeAt - Date.now())),
    );
  }

  private publishScores(): void {
    if (!this.round) return;
    const scores: TriviaScoreEntry[] = Object.entries(this.round.scores).map(([userId, triviaPoints]) => ({
      userId,
      triviaPoints,
    }));
    this.bus.emit('triviaScoreUpdated', {
      matchId: MATCH_ID,
      scores,
      updatedAt: Date.now(),
    });
  }

  submitAnswer(
    userId: string,
    questionId: string,
    answer: string,
  ): { correct: boolean; pointsAwarded: number; correctOptionId: string; correctLabel: string } {
    if (!this.round || this.round.status !== 'active') {
      throw new Error('No active trivia round');
    }
    const q = this.round.questions.find((x) => x.questionId === questionId);
    if (!q) throw new Error('Unknown question');

    const now = Date.now();
    const endsAt = this.round.startsAt + q.questionNumber * TRIVIA_QUESTION_MS;
    if (now > endsAt) throw new Error('Question expired');

    const answerKey = `${userId}#${q.questionNumber}`;
    if (this.round.answers.has(answerKey)) {
      throw new Error('Already answered');
    }
    this.round.answers.add(answerKey);

    const correct = answer === q.correctAnswer;
    const pointsAwarded = correct ? POINTS_PER_CORRECT : 0;
    this.round.scores[userId] = (this.round.scores[userId] ?? 0) + pointsAwarded;
    this.publishScores();

    const correctOption = q.options.find((o) => o.id === q.correctAnswer);
    return {
      correct,
      pointsAwarded,
      correctOptionId: q.correctAnswer,
      correctLabel: correctOption?.label ?? q.correctAnswer,
    };
  }

  private async finishRound(): Promise<void> {
    if (!this.round || this.round.status === 'completed') return;
    this.round.status = 'completed';

    const pe = getPromptEngine();
    const scores: TriviaScoreEntry[] = [];
    for (const [userId, pts] of Object.entries(this.round.scores)) {
      scores.push({ userId, triviaPoints: pts });
      if (pts > 0) pe.awardTriviaPoints(userId, pts);
    }

    this.bus.emit('triviaCompleted', {
      matchId: MATCH_ID,
      scores,
      completedAt: Date.now(),
    });
    this.clearTimers();
  }
}

export function getHalfTimeTriviaEngine(): HalfTimeTriviaEngine {
  if (!engine) engine = new HalfTimeTriviaEngine();
  return engine;
}

export function attachHalfTimeTriviaEngine(): void {
  getHalfTimeTriviaEngine().attach();
}

export function resetHalfTimeTriviaEngine(): void {
  getHalfTimeTriviaEngine().reset();
}
