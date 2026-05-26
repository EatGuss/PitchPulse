export interface TriviaOption {
  id: string;
  label: string;
}

export interface TriviaQuestionClient {
  questionId: string;
  questionNumber: number;
  text: string;
  options: TriviaOption[];
  expiresAt: number;
}

export interface TriviaScoreEntry {
  userId: string;
  triviaPoints: number;
}

export interface TriviaStartedPayload {
  matchId: string;
  startsAt: number;
  questionDurationMs: number;
  questions: TriviaQuestionClient[];
}

export interface TriviaQuestionClosedPayload {
  matchId: string;
  questionNumber: number;
  questionId: string;
  correctOptionId: string;
  correctLabel: string;
  closedAt: number;
}

export interface TriviaCompletedPayload {
  matchId: string;
  scores: TriviaScoreEntry[];
  completedAt: number;
}

export type TriviaUiPhase = 'question' | 'reveal' | 'complete';
