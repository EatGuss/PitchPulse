// AppSync JS resolver — Mutation.publishLeaderboardUpdated (NONE data source).
// Server-only broadcast after ranked match completion updates leaderboards.

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
