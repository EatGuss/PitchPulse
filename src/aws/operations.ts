/**
 * GraphQL operation strings used by the frontend.
 *
 * Kept as plain template literals (no codegen) — the AppSync schema is small
 * enough that hand-writing the queries is faster than wiring up a generator
 * for a hackathon submission.
 */

export const START_MATCH = /* GraphQL */ `
  mutation StartMatch($input: StartMatchInput!) {
    startMatch(input: $input) {
      matchId
      startedAtWallMs
      isRunning
    }
  }
`;

export const FIRE_REACTION = /* GraphQL */ `
  mutation FireReaction($input: FireReactionInput!) {
    fireReaction(input: $input) {
      matchId
      reactionId
      userId
      emoji
      ts
    }
  }
`;

export const SUB_MATCH_CLOCK = /* GraphQL */ `
  subscription OnMatchClock($matchId: ID!) {
    matchClock(matchId: $matchId) {
      matchId
      matchMinute
      displayClock
      phase
      scoreHome
      scoreGuest
      isRunning
      updatedAt
    }
  }
`;

export const SUB_MATCH_EVENT = /* GraphQL */ `
  subscription OnMatchEvent($matchId: ID!) {
    matchEvent(matchId: $matchId) {
      matchId
      seq
      id
      type
      matchMinute
      displayMinute
      matchPhase
      teamId
      playerId
      assistPlayerId
      cardColor
      reason
      scoreHome
      scoreGuest
      eventTimeIso
    }
  }
`;

export const SUB_ROOM_REACTION = /* GraphQL */ `
  subscription OnRoomReaction($matchId: ID!) {
    roomReaction(matchId: $matchId) {
      matchId
      reactionId
      userId
      emoji
      ts
    }
  }
`;
