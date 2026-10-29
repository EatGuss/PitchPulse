/**
 * H1 phase P1 — identity checks, run headless (no AWS account needed).
 *
 *   Authorizer: real RS256 JWTs signed with a throwaway key, verified by
 *   aws-jwt-verify against an injected JWKS (no network).
 *   Handlers:   real handler code with the AWS SDK clients mocked, asserting
 *   who the server acts as and which writes it refuses to make.
 *
 * Run from the repo root: npm run verify:identity
 */

import { generateKeyPairSync, createSign, type KeyObject } from 'node:crypto';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}
async function rejects(fn: () => Promise<unknown>, match: RegExp): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err) {
    return match.test(String(err));
  }
}

// ── Environment the handlers read at import time ──────────────────────────
Object.assign(process.env, {
  AWS_REGION: 'eu-central-1',
  ROOMS_TABLE: 'pp-rooms',
  USERS_TABLE: 'pp-users',
  LEADERBOARDS_TABLE: 'pp-leaderboards',
  PROMPTS_TABLE: 'pp-prompts',
  MATCHES_TABLE: 'pp-matches',
  SIM_EMITTER_FN: 'pp-sim-emitter',
  APPSYNC_URL: 'https://example.appsync-api.eu-central-1.amazonaws.com/graphql',
  USER_POOL_ID: 'eu-central-1_TESTPOOL',
  USER_POOL_CLIENT_ID: 'testclient123',
});

// ── Token minting ──────────────────────────────────────────────────────────
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid';
const ISSUER = `https://cognito-idp.eu-central-1.amazonaws.com/${process.env.USER_POOL_ID}`;

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
function mint(claims: Record<string, unknown>, key: KeyObject = privateKey, header: object = { alg: 'RS256', kid: KID }): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER,
    aud: process.env.USER_POOL_CLIENT_ID,
    token_use: 'id',
    iat: now,
    exp: now + 3600,
    ...claims,
  };
  const head = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createSign('RSA-SHA256').update(head).sign(key);
  return `${head}.${b64url(sig)}`;
}

async function main(): Promise<void> {
  // ── Authorizer ───────────────────────────────────────────────────────────
  console.log('authorizer');
  const authz = await import('../lambda/authorizer/index');
  const verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.USER_POOL_ID!,
    clientId: process.env.USER_POOL_CLIENT_ID!,
    tokenUse: 'id',
  });
  const jwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, string>), kid: KID, alg: 'RS256', use: 'sig' };
  verifier.cacheJwks({ keys: [jwk as never] });
  authz.setVerifierForTests(verifier as never);

  const authorize = (token: string) =>
    authz.handler({ authorizationToken: token, requestContext: {} } as never);

  const alice = await authorize(mint({ 'cognito:username': 'alice', name: 'Alice' }));
  check('valid token is authorized as its user', alice.isAuthorized && alice.resolverContext?.userId === 'alice');
  check('display name comes from the token', alice.resolverContext?.displayName === 'Alice');
  check(
    'non-operator is denied match control',
    JSON.stringify(alice.deniedFields) === JSON.stringify(['Mutation.startMatch', 'Mutation.resetMatch']),
    JSON.stringify(alice.deniedFields),
  );
  check('cache TTL never exceeds 300 s', (alice.ttlOverride ?? 0) > 0 && (alice.ttlOverride ?? 999) <= 300);

  const op = await authorize(mint({ 'cognito:username': 'operator', 'cognito:groups': ['operators'] }));
  check('operator may control the match', op.isAuthorized && (op.deniedFields ?? []).length === 0);
  check('"Bearer " prefix accepted', (await authorize(`Bearer ${mint({ 'cognito:username': 'bob' })}`)).isAuthorized);

  const now = Math.floor(Date.now() / 1000);
  check('expired token rejected', !(await authorize(mint({ 'cognito:username': 'alice', exp: now - 10, iat: now - 100 }))).isAuthorized);
  check('token for another app client rejected', !(await authorize(mint({ 'cognito:username': 'alice', aud: 'someone-else' }))).isAuthorized);
  check('access token (not id) rejected', !(await authorize(mint({ 'cognito:username': 'alice', token_use: 'access' }))).isAuthorized);
  check('token from another issuer rejected', !(await authorize(mint({ 'cognito:username': 'alice', iss: 'https://evil.example' }))).isAuthorized);
  check('token signed with a different key rejected', !(await authorize(mint({ 'cognito:username': 'alice' }, otherKey))).isAuthorized);
  {
    const good = mint({ 'cognito:username': 'alice' });
    const [h, , sig] = good.split('.');
    const forged = `${h}.${b64url(JSON.stringify({ iss: ISSUER, aud: process.env.USER_POOL_CLIENT_ID, token_use: 'id', exp: now + 3600, 'cognito:username': 'operator', 'cognito:groups': ['operators'] }))}.${sig}`;
    check('payload swapped under a valid signature rejected', !(await authorize(forged)).isAuthorized);
  }
  {
    const unsigned = `${b64url(JSON.stringify({ alg: 'none' }))}.${b64url(JSON.stringify({ iss: ISSUER, aud: process.env.USER_POOL_CLIENT_ID, token_use: 'id', exp: now + 3600, 'cognito:username': 'alice' }))}.`;
    check('alg=none token rejected', !(await authorize(unsigned)).isAuthorized);
  }
  check('missing token rejected', !(await authorize('')).isAuthorized);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const ddb = mockClient(DynamoDBClient);
  const lambda = mockClient(LambdaClient);
  const as = (userId: string, groups = '') => ({ resolverContext: { userId, displayName: userId.toUpperCase(), groups } });
  const ev = (fieldName: string, args: Record<string, unknown>, identity?: unknown) =>
    ({ info: { fieldName }, arguments: args, identity }) as never;
  const sent = (cmd: unknown) => ddb.commandCalls(cmd as never).map((c) => c.args[0].input as Record<string, unknown>);

  console.log('room-handler');
  const room = await import('../lambda/room-handler/index');
  check(
    'request with no verified caller is refused',
    await rejects(() => room.handler(ev('createRoom', { input: { matchId: 'M' } })), /Unauthorized/),
  );

  ddb.reset();
  ddb.on(QueryCommand).resolves({ Items: [] }); // invite code free
  ddb.on(PutItemCommand).resolves({});
  const created = (await room.handler(
    ev('createRoom', { input: { matchId: 'M', userId: 'mallory', displayName: 'Mallory' } }, as('alice')),
  )) as { hostUserId: string };
  const memberPut = sent(PutItemCommand).find((i) => JSON.stringify(i).includes('MEMBER#'));
  check('createRoom hosts as the caller, ignoring a smuggled userId', created.hostUserId === 'alice');
  check(
    'createRoom writes the caller as member',
    JSON.stringify(memberPut).includes('MEMBER#alice') && !JSON.stringify(sent(PutItemCommand)).includes('mallory'),
  );

  ddb.reset();
  ddb.on(GetItemCommand, { Key: { PK: { S: 'ROOM#r1' }, SK: { S: 'META' } } }).resolves({
    Item: { roomId: { S: 'r1' }, inviteCode: { S: 'ABC-DEF' }, matchId: { S: 'M' }, hostUserId: { S: 'bob' }, roomName: { S: 'X' }, status: { S: 'ACTIVE' }, createdAt: { N: '1' } },
  });
  ddb.on(GetItemCommand, { Key: { PK: { S: 'ROOM#r1' }, SK: { S: 'MEMBER#bob' } } }).resolves({ Item: { userId: { S: 'bob' } } });
  ddb.on(GetItemCommand, { Key: { PK: { S: 'ROOM#r1' }, SK: { S: 'MEMBER#eve' } } }).resolves({});
  ddb.on(PutItemCommand).resolves({});
  check(
    'non-member cannot comment',
    await rejects(() => room.handler(ev('postComment', { input: { roomId: 'r1', promptId: 'p', text: 'hi' } }, as('eve'))), /not a member/),
  );
  check(
    'non-member cannot react',
    await rejects(() => room.handler(ev('fireReaction', { input: { roomId: 'r1', emoji: '🔥' } }, as('eve'))), /not a member/),
  );
  check('refused writes never reach DynamoDB', sent(PutItemCommand).length === 0);
  const comment = (await room.handler(
    ev('postComment', { input: { roomId: 'r1', promptId: 'p', text: 'nice', userId: 'alice' } }, as('bob')),
  )) as { userId: string };
  check('member comment is attributed to the caller', comment.userId === 'bob');
  check(
    'unknown reaction emoji refused',
    await rejects(() => room.handler(ev('fireReaction', { input: { roomId: 'r1', emoji: '<script>' } }, as('bob'))), /Unsupported reaction/),
  );
  const reaction = (await room.handler(ev('fireReaction', { input: { roomId: 'r1', emoji: '⚽' } }, as('bob')))) as { userId: string };
  check('member reaction is attributed to the caller', reaction.userId === 'bob');

  console.log('ranked-handler');
  const ranked = await import('../lambda/ranked-handler/index');
  ddb.reset();
  ddb.on(GetItemCommand).resolves({});
  ddb.on(UpdateItemCommand).resolves({});
  ddb.on(PutItemCommand).resolves({});
  check(
    'outsider cannot complete someone else\'s ranked match',
    await rejects(
      () => ranked.handler(ev('completeRankedMatch', { matchId: 'M', winnerId: 'alice', loserId: 'bob', winnerMatchPoints: 999, loserMatchPoints: 0 }, as('eve'))),
      /only a participant/,
    ),
  );
  check(
    'and nothing was written',
    sent(PutItemCommand).length === 0 && sent(UpdateItemCommand).length === 0,
  );
  ddb.reset();
  ddb.on(GetItemCommand).resolves({ Item: { unlockedTitles: { L: [{ S: 'sniper' }] } } });
  ddb.on(UpdateItemCommand).resolves({});
  await ranked.handler(ev('equipTitle', { titleId: 'sniper', userId: 'bob' }, as('alice')));
  check(
    'equipTitle changes the caller\'s profile only',
    JSON.stringify(sent(UpdateItemCommand)).includes('USER#alice') && !JSON.stringify(sent(UpdateItemCommand)).includes('USER#bob'),
  );

  console.log('vote-handler');
  const vote = await import('../lambda/vote-handler/index');
  ddb.reset();
  ddb.on(PutItemCommand).resolves({});
  const v = (await vote.handler(
    ev('submitVote', { input: { matchId: 'M', promptId: 'p1', optionId: 'yes', userId: 'bob' } }, as('alice')),
  )) as { userId: string };
  check('vote is recorded for the caller', v.userId === 'alice' && JSON.stringify(sent(PutItemCommand)).includes('VOTE#alice'));

  console.log('start-match');
  const start = await import('../lambda/start-match/index');
  ddb.reset();
  ddb.on(PutItemCommand).resolves({});
  lambda.reset();
  lambda.on(InvokeCommand).resolves({});
  check(
    'player cannot start the shared match',
    await rejects(() => start.handler(ev('startMatch', { input: { matchId: 'M' } }, as('alice'))), /operator-only/),
  );
  check(
    'player cannot reset it either',
    await rejects(() => start.handler(ev('resetMatch', { input: { matchId: 'M' } }, as('bob'))), /operator-only/),
  );
  check('refused start touched nothing', sent(PutItemCommand).length === 0 && lambda.commandCalls(InvokeCommand).length === 0);
  await start.handler(ev('startMatch', { input: { matchId: 'M' } }, as('operator', 'operators')));
  check('operator can start the match', sent(PutItemCommand).length === 1 && lambda.commandCalls(InvokeCommand).length === 1);

  if (failed > 0) {
    console.error(`[verify-identity] ${failed} failed`);
    process.exit(1);
  }
  console.log('[verify-identity] All checks passed');
}

void main();
