/**
 * notifyTierPromoted — NONE resolver pass-through for tierPromoted subscription.
 */
export function request(ctx) {
  return {};
}

export function response(ctx) {
  return ctx.arguments;
}
