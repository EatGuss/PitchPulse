/**
 * notifyTitleUnlocked — NONE resolver pass-through for titleUnlocked subscription.
 */
export function request(ctx) {
  return {};
}

export function response(ctx) {
  return ctx.arguments;
}
