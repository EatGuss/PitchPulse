// AppSync JS resolver — Mutation.submitVote (DynamoDB data source = pp-prompts).
//
// Client-callable. For MVP this resolver persists the vote without server-side
// 30-second window enforcement — the client-side PromptEngine still owns vote
// timing. Gate 5 / post-MVP swaps this for a pipeline resolver that:
//   1. Reads the prompt META item to read closesAtWallMs
//   2. Rejects with util.error if Date.now() >= closesAtWallMs
//   3. Then writes the VOTE item
// The current single-function form is enough to prove the AppSync mutation +
// DynamoDB write + subscription fan-out pillar.

import { util } from '@aws-appsync/utils';
import * as ddb from '@aws-appsync/utils/dynamodb';

export function request(ctx) {
  const { matchId, promptId, userId, optionId } = ctx.args.input;
  const votedAt = util.time.nowEpochMilliSeconds();
  const expiresAt = Math.floor(votedAt / 1000) + 86400; // 24h TTL

  return ddb.put({
    key: {
      PK: `PROMPT#${promptId}`,
      SK: `VOTE#${userId}`,
    },
    item: {
      matchId,
      promptId,
      userId,
      optionId,
      votedAt,
      expiresAt,
    },
  });
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return {
    matchId: ctx.result.matchId,
    promptId: ctx.result.promptId,
    userId: ctx.result.userId,
    optionId: ctx.result.optionId,
    votedAt: ctx.result.votedAt,
  };
}
