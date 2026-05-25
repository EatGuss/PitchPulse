// AppSync JS resolver — Mutation.fireReaction (DynamoDB data source = pp-rooms).
//
// Persists under ROOM#<roomId>/REACTION#<ts>#<id>. Watch Room passes the private room UUID.

import { util } from '@aws-appsync/utils';
import * as ddb from '@aws-appsync/utils/dynamodb';

export function request(ctx) {
  const { roomId, userId, emoji } = ctx.args.input;
  const ts = util.time.nowEpochMilliSeconds();
  const reactionId = util.autoId();
  const expiresAt = Math.floor(ts / 1000) + 86400;

  return ddb.put({
    key: {
      PK: `ROOM#${roomId}`,
      SK: `REACTION#${ts}#${reactionId}`,
    },
    item: {
      roomId,
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
  return {
    roomId: ctx.result.roomId,
    reactionId: ctx.result.reactionId,
    userId: ctx.result.userId,
    emoji: ctx.result.emoji,
    ts: ctx.result.ts,
  };
}
