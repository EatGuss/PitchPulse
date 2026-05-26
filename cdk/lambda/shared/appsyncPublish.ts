/**
 * Signed AppSync GraphQL mutation helper (IAM auth) — shared by stream-handler
 * and ranked-handler for server-side subscription broadcasts.
 */

import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { SignatureV4 } from '@aws-sdk/signature-v4';

const REGION = process.env.AWS_REGION ?? 'eu-central-1';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

let cachedSigner: SignatureV4 | null = null;
let cachedEndpoint: URL | null = null;

function getSigner(): { signer: SignatureV4; endpoint: URL } {
  if (!cachedSigner || !cachedEndpoint) {
    cachedEndpoint = new URL(required('APPSYNC_URL'));
    cachedSigner = new SignatureV4({
      credentials: defaultProvider(),
      region: REGION,
      service: 'appsync',
      sha256: Sha256,
    });
  }
  return { signer: cachedSigner, endpoint: cachedEndpoint };
}

export async function appsyncMutation(
  query: string,
  variables: Record<string, unknown>,
): Promise<void> {
  const { signer, endpoint } = getSigner();
  const body = JSON.stringify({ query, variables });
  const req = new HttpRequest({
    hostname: endpoint.hostname,
    path: endpoint.pathname,
    protocol: endpoint.protocol,
    method: 'POST',
    headers: {
      host: endpoint.hostname,
      'content-type': 'application/json',
    },
    body,
  });
  const signed = await signer.sign(req);

  const res = await fetch(`${endpoint.protocol}//${endpoint.hostname}${endpoint.pathname}`, {
    method: 'POST',
    headers: signed.headers as Record<string, string>,
    body: signed.body as string,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppSync ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { errors?: unknown };
  if (json.errors) {
    throw new Error(`AppSync GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
}

export const PUBLISH_LEADERBOARD_UPDATED = /* GraphQL */ `
  mutation PublishLeaderboardUpdated($input: LeaderboardUpdatedInput!) {
    publishLeaderboardUpdated(input: $input) {
      period
      seasonNumber
      isoWeek
      updatedAt
    }
  }
`;

export const NOTIFY_TITLE_UNLOCKED = /* GraphQL */ `
  mutation NotifyTitleUnlocked($userId: ID!, $titleId: ID!, $titleName: String!, $ts: AWSTimestamp!) {
    notifyTitleUnlocked(userId: $userId, titleId: $titleId, titleName: $titleName, ts: $ts) {
      userId
      titleId
      titleName
      ts
    }
  }
`;

export const NOTIFY_TIER_PROMOTED = /* GraphQL */ `
  mutation NotifyTierPromoted($userId: ID!, $previousTier: Tier!, $newTier: Tier!, $ts: AWSTimestamp!) {
    notifyTierPromoted(userId: $userId, previousTier: $previousTier, newTier: $newTier, ts: $ts) {
      userId
      previousTier
      newTier
      ts
    }
  }
`;
