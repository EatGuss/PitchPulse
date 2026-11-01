/**
 * Checks that `npm run aws:deploy` can work for an AWS account that is not
 * the hackathon sandbox — run headless, no AWS account needed.
 *
 *   stack:  synthesizes the real stack (default and -c matchData=dfl) and
 *           asserts the properties a fresh account depends on
 *   lease:  sim-emitter admits one loop at a time (DynamoDB mocked)
 *   env:    .env.local merging used by the deploy script
 *
 * Run from the repo root: npm run verify:deploy
 */

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { mockClient } from 'aws-sdk-client-mock';
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { PitchPulseStack } from '../lib/pitchpulse-stack';
import { mergeEnv, outputsToEnv } from '../scripts/env';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

type Resources = Record<string, { Type: string; Properties?: Record<string, unknown>; DependsOn?: string[] }>;

function synth(context: Record<string, string> = {}): Resources {
  // A stranger's account, not the hackathon sandbox.
  const app = new App({ context });
  const stack = new PitchPulseStack(app, 'PitchPulseStack', {
    env: { account: '111122223333', region: 'us-east-1' },
  });
  return Template.fromStack(stack).toJSON().Resources as Resources;
}

function ofType(res: Resources, type: string) {
  return Object.entries(res).filter(([, r]) => r.Type === type);
}

function simEmitter(res: Resources) {
  return ofType(res, 'AWS::Lambda::Function').find(
    ([, r]) => (r.Properties as { FunctionName?: string }).FunctionName === 'pp-sim-emitter',
  )![1];
}

async function main(): Promise<void> {
  console.log('stack (default: synthetic match data)');
  const res = synth();
  const text = JSON.stringify(res);

  const runtimes = new Set(
    ofType(res, 'AWS::Lambda::Function').map(([, r]) => String((r.Properties as { Runtime?: string }).Runtime)),
  );
  check(
    'no Lambda on a deprecated Node runtime',
    ![...runtimes].some((r) => /^nodejs(1\d|20)\.x$/.test(r)),
    [...runtimes].join(','),
  );
  check(
    'no reserved concurrency (rejected on new accounts with a limit of 10)',
    ofType(res, 'AWS::Lambda::Function').every(([, r]) => !('ReservedConcurrentExecutions' in (r.Properties ?? {}))),
  );
  check('stack never references the hackathon sandbox account or bucket', !text.includes('058755927272'));
  check('creates its own match-data bucket', ofType(res, 'AWS::S3::Bucket').length === 1);
  check('uploads the synthetic match XML into it', ofType(res, 'Custom::CDKBucketDeployment').length === 1);
  const simEnv = (simEmitter(res).Properties as { Environment: { Variables: Record<string, unknown> } }).Environment.Variables;
  check(
    'sim reads the synthetic files from that bucket',
    String(simEnv.MATCH_EVENTS_KEY) === 'synthetic-match/Events_Synthetic.xml' &&
      JSON.stringify(simEnv.MATCH_DATA_BUCKET).includes('MatchDataBucket'),
    JSON.stringify(simEnv),
  );
  check('sim waits for the upload to finish', (simEmitter(res).DependsOn ?? []).some((d) => d.startsWith('SyntheticMatchData')));

  const secrets = ofType(res, 'AWS::SecretsManager::Secret');
  check('demo password is generated, not supplied', secrets.length === 1 && 'GenerateSecretString' in (secrets[0]![1].Properties ?? {}));
  check('no fixed secret name (destroy-then-redeploy would collide)', !('Name' in (secrets[0]![1].Properties ?? {})));
  check('no SSM parameter is required before deploying', !text.includes('ssm:GetParameter'));
  const demoUsers = ofType(res, 'AWS::CloudFormation::CustomResource')[0]![1];
  check(
    'demo users are created only after the operators group exists',
    (demoUsers.DependsOn ?? []).some((d) => d.startsWith('OperatorsGroup')),
    JSON.stringify(demoUsers.DependsOn),
  );
  check('password never appears in the template', !/"Password"\s*:/.test(text));

  console.log('stack (-c matchData=dfl)');
  const dfl = synth({ matchData: 'dfl' });
  const dflEnv = (simEmitter(dfl).Properties as { Environment: { Variables: Record<string, unknown> } }).Environment.Variables;
  check('dfl mode reads the hackathon bucket', dflEnv.MATCH_DATA_BUCKET === 'hackathon-data-058755927272');
  check('dfl mode creates no bucket of its own', ofType(dfl, 'AWS::S3::Bucket').length === 0);
  let threw = false;
  try {
    synth({ matchData: 'bogus' });
  } catch {
    threw = true;
  }
  check('unknown matchData value is rejected at synth', threw);

  console.log('sim-emitter lease');
  Object.assign(process.env, {
    AWS_REGION: 'us-east-1',
    MATCH_DATA_BUCKET: 'b',
    MATCH_EVENTS_KEY: 'e',
    MATCH_INFO_KEY: 'i',
    MATCHES_TABLE: 'pp-matches',
  });
  const ddb = mockClient(DynamoDBClient);
  const s3 = mockClient(S3Client);
  const emitter = await import('../lambda/sim-emitter/index');
  // Simulate the lease row: one owner until it expires.
  let holder: { owner: string; until: number } | null = null;
  ddb.on(UpdateItemCommand).callsFake((input: { ConditionExpression?: string; ExpressionAttributeValues: Record<string, { S?: string; N?: string }> }) => {
    const v = input.ExpressionAttributeValues;
    const now = Number(v[':now']?.N ?? Date.now());
    if (input.ConditionExpression?.startsWith('attribute_not_exists')) {
      const owner = v[':o']!.S!;
      if (holder && holder.until >= now && holder.owner !== owner) {
        throw new ConditionalCheckFailedException({ message: 'held', $metadata: {} });
      }
      holder = { owner, until: Number(v[':u']!.N) };
    } else {
      const current = holder;
      if (current && current.owner === v[':o']?.S) holder = { owner: current.owner, until: 0 }; // release
    }
    return {};
  });
  check('first invocation takes the lease', await emitter.acquireLease('A', 1_000));
  check('a concurrent invocation is turned away', !(await emitter.acquireLease('B', 2_000)));
  check('the holder can renew', await emitter.acquireLease('A', 3_000));
  // A's renewal at t=3000 holds until 3000 + 250 s; B gets in only after that.
  check('a crashed holder still blocks just before expiry', !(await emitter.acquireLease('B', 3_000 + 249_999)));
  check('a crashed holder\'s lease expires (after 250 s)', await emitter.acquireLease('B', 3_000 + 250_001));

  holder = { owner: 'other', until: Date.now() + 60_000 };
  ddb.on(GetItemCommand).resolves({});
  await emitter.handler(undefined, { awsRequestId: 'late' } as never);
  check(
    'a turned-away invocation exits without loading data or ticking',
    s3.calls().length === 0 && ddb.commandCalls(GetItemCommand).length === 0,
  );

  console.log('.env.local merge');
  const existing = '# comment\nVITE_APPSYNC_URL=\nVITE_SIM_SECONDS_PER_MATCH_MINUTE=2\nVITE_APPSYNC_REGION=old\n';
  const merged = mergeEnv(existing, { VITE_APPSYNC_URL: 'https://x/graphql', VITE_APPSYNC_REGION: 'us-east-1', VITE_COGNITO_USER_POOL_CLIENT_ID: 'c' });
  check(
    'sets keys in place, keeps other lines, appends missing keys',
    merged ===
      '# comment\nVITE_APPSYNC_URL=https://x/graphql\nVITE_SIM_SECONDS_PER_MATCH_MINUTE=2\nVITE_APPSYNC_REGION=us-east-1\nVITE_COGNITO_USER_POOL_CLIENT_ID=c\n',
    JSON.stringify(merged),
  );
  check('merge is idempotent', mergeEnv(merged, { VITE_APPSYNC_REGION: 'us-east-1' }) === merged);
  const env = outputsToEnv({ PitchPulseStack: { AppSyncGraphQLUrl: 'u', Region: 'r', UserPoolClientId: 'c' } });
  check('stack outputs map to the frontend vars', env.VITE_APPSYNC_URL === 'u' && env.VITE_APPSYNC_REGION === 'r' && env.VITE_COGNITO_USER_POOL_CLIENT_ID === 'c');
  let missing = false;
  try {
    outputsToEnv({ PitchPulseStack: { AppSyncGraphQLUrl: 'u' } });
  } catch {
    missing = true;
  }
  check('a missing output is an error, not a half-written .env.local', missing);

  if (failed > 0) {
    console.error(`[verify-deploy] ${failed} failed`);
    process.exit(1);
  }
  console.log('[verify-deploy] All checks passed');
}

void main();
