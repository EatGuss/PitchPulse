export {
  appsyncMutation,
} from './appsyncPublish';

export const PUBLISH_TRIVIA_STARTED = /* GraphQL */ `
  mutation PublishTriviaStarted($input: TriviaStartedInput!) {
    publishTriviaStarted(input: $input) {
      matchId
      startsAt
      questionDurationMs
      questions {
        questionId
        questionNumber
        text
        options {
          id
          label
        }
        expiresAt
      }
    }
  }
`;

export const PUBLISH_TRIVIA_SCORE_UPDATED = /* GraphQL */ `
  mutation PublishTriviaScoreUpdated($input: TriviaScoreUpdatedInput!) {
    publishTriviaScoreUpdated(input: $input) {
      matchId
      scores {
        userId
        triviaPoints
      }
      updatedAt
    }
  }
`;

export const PUBLISH_TRIVIA_QUESTION_CLOSED = /* GraphQL */ `
  mutation PublishTriviaQuestionClosed($input: TriviaQuestionClosedInput!) {
    publishTriviaQuestionClosed(input: $input) {
      matchId
      questionNumber
      questionId
      correctOptionId
      correctLabel
      closedAt
    }
  }
`;

export const PUBLISH_TRIVIA_COMPLETED = /* GraphQL */ `
  mutation PublishTriviaCompleted($input: TriviaCompletedInput!) {
    publishTriviaCompleted(input: $input) {
      matchId
      scores {
        userId
        triviaPoints
      }
      completedAt
    }
  }
`;
