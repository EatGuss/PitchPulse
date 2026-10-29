/**
 * Verified caller identity for client-callable resolvers.
 *
 * Client requests use the AWS_LAMBDA auth mode: lambda/authorizer verifies the
 * Cognito ID token and passes the result to resolvers as resolverContext.
 * Handlers must take the acting user from here, never from GraphQL arguments.
 */

export const OPERATORS_GROUP = 'operators';

export interface Caller {
  userId: string;
  displayName: string;
  groups: string[];
}

interface IdentityLike {
  resolverContext?: Record<string, string | undefined>;
}

export function callerFrom(event: { identity?: unknown }): Caller {
  const ctx = (event.identity as IdentityLike | null | undefined)?.resolverContext;
  const userId = ctx?.userId;
  if (!userId) throw new Error('Unauthorized: request has no verified caller');
  return {
    userId,
    displayName: ctx.displayName || userId,
    groups: ctx.groups ? ctx.groups.split(',').filter(Boolean) : [],
  };
}

export function requireOperator(caller: Caller): void {
  if (!caller.groups.includes(OPERATORS_GROUP)) {
    throw new Error('Forbidden: match control is operator-only');
  }
}
