/**
 * AWS-mode sign-in and per-user GraphQL calls.
 *
 * Every AppSync request carries a Cognito ID token for the user it acts as;
 * the server takes the acting user from that verified token, never from the
 * request. /demo plays Alice and Bob in one tab, so we hold one token per
 * persona (plus the operator who runs the match clock) and pass the right one
 * on each call — Amplify's singleton session can only hold one user, hence
 * the plain InitiateAuth calls below instead of Amplify Auth.
 *
 * Tokens live in memory only (the challenge brief rules out localStorage), so
 * a page reload asks for the demo password again.
 */

import { generateClient } from 'aws-amplify/api';
import type { DemoUserId } from '../data/personas';
import { awsConfig } from './config';

/** Accounts created by the stack; all share the deployer-set demo password. */
export type SessionUser = DemoUserId | 'operator';
export const SESSION_USERS: readonly SessionUser[] = ['alice', 'bob', 'operator'];

/** Identity used for shared, user-independent reads and subscriptions. */
export const VIEWER: SessionUser = 'operator';

interface Tokens {
  idToken: string;
  refreshToken: string;
  /** Epoch ms when the ID token expires. */
  expiresAt: number;
}

const tokens = new Map<SessionUser, Tokens>();
const listeners = new Set<() => void>();
/** Refresh this long before expiry so a request never carries a dying token. */
const REFRESH_MARGIN_MS = 5 * 60_000;

interface InitiateAuthResponse {
  AuthenticationResult?: { IdToken: string; RefreshToken?: string; ExpiresIn: number };
  ChallengeName?: string;
  message?: string;
  __type?: string;
}

async function initiateAuth(
  authFlow: 'USER_PASSWORD_AUTH' | 'REFRESH_TOKEN_AUTH',
  params: Record<string, string>,
): Promise<InitiateAuthResponse> {
  const res = await fetch(`https://cognito-idp.${awsConfig.region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: authFlow,
      ClientId: awsConfig.userPoolClientId,
      AuthParameters: params,
    }),
  });
  const body = (await res.json()) as InitiateAuthResponse;
  if (!res.ok) {
    throw new Error(
      body.__type?.includes('NotAuthorized') ? 'Wrong demo password' : body.message ?? 'Sign-in failed',
    );
  }
  return body;
}

function store(user: SessionUser, result: NonNullable<InitiateAuthResponse['AuthenticationResult']>, refresh?: string) {
  tokens.set(user, {
    idToken: result.IdToken,
    refreshToken: result.RefreshToken ?? refresh ?? '',
    expiresAt: Date.now() + result.ExpiresIn * 1000,
  });
}

/** Sign every demo account in with the shared demo password. All-or-nothing. */
export async function signInDemo(password: string): Promise<void> {
  const results = await Promise.all(
    SESSION_USERS.map(async (user) => {
      const res = await initiateAuth('USER_PASSWORD_AUTH', { USERNAME: user, PASSWORD: password });
      if (!res.AuthenticationResult) {
        throw new Error(`Sign-in for ${user} needs ${res.ChallengeName ?? 'an unsupported step'}`);
      }
      return [user, res.AuthenticationResult] as const;
    }),
  );
  for (const [user, result] of results) store(user, result);
  listeners.forEach((l) => l());
}

export function isSignedIn(): boolean {
  return SESSION_USERS.every((u) => tokens.has(u));
}

export function subscribeSession(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** A valid ID token for `user`, refreshed first if it is close to expiry. */
export async function tokenFor(user: SessionUser): Promise<string> {
  const current = tokens.get(user);
  if (!current) throw new Error(`Not signed in as ${user}`);
  if (current.expiresAt - Date.now() > REFRESH_MARGIN_MS) return current.idToken;
  const res = await initiateAuth('REFRESH_TOKEN_AUTH', { REFRESH_TOKEN: current.refreshToken });
  if (!res.AuthenticationResult) throw new Error(`Token refresh for ${user} failed`);
  store(user, res.AuthenticationResult, current.refreshToken);
  return tokens.get(user)!.idToken;
}

interface GraphqlOptions {
  query: string;
  variables: Record<string, unknown>;
  authMode: 'lambda';
  authToken: string;
}
/** Amplify's generated option types are too deep for tsc here; callers cast the result. */
type LooseGraphql = (options: GraphqlOptions) => unknown;

let loose: LooseGraphql | null = null;
function graphql(options: GraphqlOptions): unknown {
  if (!loose) {
    const client = generateClient();
    loose = client.graphql.bind(client) as unknown as LooseGraphql;
  }
  return loose(options);
}

export interface GqlResult<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** Query or mutation acting as `as`. */
export async function gql<T>(
  as: SessionUser,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GqlResult<T>> {
  const authToken = await tokenFor(as);
  return (await graphql({ query, variables, authMode: 'lambda', authToken })) as GqlResult<T>;
}

interface SubscriptionLike<T> {
  subscribe: (handlers: {
    next: (value: { data: T }) => void;
    error?: (err: unknown) => void;
  }) => { unsubscribe: () => void };
}

/** Subscription acting as `as`. Returns an unsubscribe that is safe to call before it connects. */
export function gqlSubscribe<T>(
  as: SessionUser,
  query: string,
  variables: Record<string, unknown>,
  handlers: { next: (data: T) => void; error?: (err: unknown) => void },
): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  void tokenFor(as)
    .then((authToken) => {
      if (cancelled) return;
      const obs = graphql({ query, variables, authMode: 'lambda', authToken }) as SubscriptionLike<T>;
      const sub = obs.subscribe({
        next: ({ data }) => handlers.next(data),
        error: handlers.error,
      });
      unsubscribe = () => sub.unsubscribe();
    })
    .catch((err) => handlers.error?.(err));
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
