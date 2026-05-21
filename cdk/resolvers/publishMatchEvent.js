// AppSync JS resolver — Mutation.publishMatchEvent (NONE data source).
// Mirrors publishMatchClock; see that file for the architecture rationale.

export function request(ctx) {
  return { payload: ctx.args.input };
}

export function response(ctx) {
  return ctx.result;
}
