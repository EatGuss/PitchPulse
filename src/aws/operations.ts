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
      roomId
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
  subscription OnRoomReaction($roomId: ID!) {
    roomReaction(roomId: $roomId) {
      roomId
      reactionId
      userId
      emoji
      ts
    }
  }
`;

export const CREATE_ROOM = /* GraphQL */ `
  mutation CreateRoom($input: CreateRoomInput!) {
    createRoom(input: $input) {
      roomId
      inviteCode
      roomName
      matchId
      hostUserId
      status
      createdAt
    }
  }
`;

export const JOIN_ROOM = /* GraphQL */ `
  mutation JoinRoom($input: JoinRoomInput!) {
    joinRoom(input: $input) {
      roomId
      inviteCode
      roomName
      matchId
      status
      members {
        userId
        displayName
        joinedAt
      }
      joinedMember {
        userId
        displayName
        joinedAt
      }
    }
  }
`;

export const POST_COMMENT = /* GraphQL */ `
  mutation PostComment($input: PostCommentInput!) {
    postComment(input: $input) {
      roomId
      commentId
      promptId
      userId
      text
      ts
    }
  }
`;

export const LEAVE_ROOM = /* GraphQL */ `
  mutation LeaveRoom($input: LeaveRoomInput!) {
    leaveRoom(input: $input)
  }
`;

export const SUB_ROOM_MEMBER_JOINED = /* GraphQL */ `
  subscription OnRoomMemberJoined($roomId: ID!) {
    roomMemberJoined(roomId: $roomId) {
      roomId
      joinedMember {
        userId
        displayName
        joinedAt
      }
      members {
        userId
        displayName
        joinedAt
      }
    }
  }
`;

export const SUB_ROOM_COMMENT = /* GraphQL */ `
  subscription OnRoomComment($roomId: ID!, $promptId: ID!) {
    roomComment(roomId: $roomId, promptId: $promptId) {
      roomId
      commentId
      promptId
      userId
      text
      ts
    }
  }
`;

export const SUB_ROOM_LEADERBOARD = /* GraphQL */ `
  subscription OnRoomLeaderboard($roomId: ID!) {
    roomLeaderboardUpdate(roomId: $roomId) {
      roomId
      updatedAt
      entries {
        userId
        displayName
        coins
      }
    }
  }
`;
