// AppSync JS resolver — Mutation.publishRoomLeaderboard (NONE data source).
// Server-only broadcast point for room-scoped leaderboard updates (Gate E).

import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return { payload: ctx.args.input };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}
