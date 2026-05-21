// AppSync JS resolver — Mutation.fireReaction (DynamoDB data source = pp-rooms).
//
// Client-callable (Cognito Identity Pool unauthenticated → IAM auth via SigV4).
// Persists the reaction under ROOM#<matchId>/REACTION#<ts>#<rand> and returns
// the reaction envelope. The return value fires the roomReaction subscription
// via @aws_subscribe, fanning out to all other subscribed clients.
//
// TTL: a 24-hour expiresAt attribute prunes the row from DynamoDB
// automatically — the room doesn't need long-term history.

import { util } from '@aws-appsync/utils';
import * as ddb from '@aws-appsync/utils/dynamodb';

export function request(ctx) {
  const { matchId, userId, emoji } = ctx.args.input;
  const ts = util.time.nowEpochMilliSeconds();
  const reactionId = util.autoId();
  const expiresAt = Math.floor(ts / 1000) + 86400; // 24h TTL

  return ddb.put({
    key: {
      PK: `ROOM#${matchId}`,
      SK: `REACTION#${ts}#${reactionId}`,
    },
    item: {
      matchId,
      reactionId,
      userId,
      emoji,
      ts,
      expiresAt,
    },
  });
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  // Return the shape the GraphQL Mutation.fireReaction expects (RoomReaction).
  return {
    matchId: ctx.result.matchId,
    reactionId: ctx.result.reactionId,
    userId: ctx.result.userId,
    emoji: ctx.result.emoji,
    ts: ctx.result.ts,
  };
}
