/**
 * AppSync AWS_LAMBDA authorizer — verifies a Cognito User Pool ID token and
 * hands the caller to resolvers as resolverContext { userId, displayName, groups }.
 *
 * A Lambda authorizer (rather than the native user-pool mode) lets the client
 * pass a different token per request, which /demo needs: one tab acts as both
 * Alice and Bob, each with their own verified identity.
 */

import type { AppSyncAuthorizerEvent, AppSyncAuthorizerResult } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { OPERATORS_GROUP } from '../shared/identity';

/** Fields only operators may call. Enforced again inside the start-match handler. */
export const OPERATOR_ONLY_FIELDS = ['Mutation.startMatch', 'Mutation.resetMatch'];

/** Upper bound on AppSync's per-token cache of this decision. */
const MAX_CACHE_SECONDS = 300;

type Verifier = { verify: (token: string) => Promise<Record<string, unknown>> };
let verifier: Verifier | null = null;

function getVerifier(): Verifier {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: required('USER_POOL_ID'),
      clientId: required('USER_POOL_CLIENT_ID'),
      tokenUse: 'id',
    }) as unknown as Verifier;
  }
  return verifier;
}

/** Tests inject a verifier backed by a local JWKS. */
export function setVerifierForTests(v: Verifier | null): void {
  verifier = v;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

type Result = AppSyncAuthorizerResult<{ userId: string; displayName: string; groups: string }>;

export const handler = async (event: AppSyncAuthorizerEvent): Promise<Result> => {
  const raw = event.authorizationToken ?? '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
  if (!token) return { isAuthorized: false };

  let claims: Record<string, unknown>;
  try {
    claims = await getVerifier().verify(token);
  } catch {
    return { isAuthorized: false };
  }

  const userId = String(claims['cognito:username'] ?? '');
  if (!userId) return { isAuthorized: false };
  const groups = Array.isArray(claims['cognito:groups'])
    ? (claims['cognito:groups'] as unknown[]).map(String)
    : [];
  const displayName = typeof claims['name'] === 'string' ? claims['name'] : userId;

  // Never let AppSync cache the decision past the token's own expiry.
  const exp = typeof claims['exp'] === 'number' ? claims['exp'] : 0;
  const secondsLeft = Math.floor(exp - Date.now() / 1000);
  if (secondsLeft <= 0) return { isAuthorized: false };

  return {
    isAuthorized: true,
    resolverContext: { userId, displayName, groups: groups.join(',') },
    deniedFields: groups.includes(OPERATORS_GROUP) ? [] : OPERATOR_ONLY_FIELDS,
    ttlOverride: Math.min(MAX_CACHE_SECONDS, secondsLeft),
  };
};
