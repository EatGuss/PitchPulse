// AppSync JS resolver — Mutation.publishMatchClock (NONE data source).
//
// Server-only mutation (IAM auth). The stream-handler Lambda invokes it to
// broadcast a clock tick to subscribed clients. The resolver itself does no
// work — it echoes the input back as the mutation's return value, which fires
// the matchClock subscription via @aws_subscribe.
//
// Reference: AWS AppSync JS resolvers overview (verified via aws-documentation
// MCP, May 2026). NONE data source = pure resolver-runtime passthrough.

export function request(ctx) {
  return { payload: ctx.args.input };
}

export function response(ctx) {
  return ctx.result;
}
