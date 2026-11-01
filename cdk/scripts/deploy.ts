/**
 * One-command AWS launch for PitchPulse.
 *
 *   npm run aws:deploy   bootstrap CDK (idempotent), deploy the stack, write
 *                        .env.local for the frontend, print the demo password
 *   npm run aws:destroy  delete the stack and switch .env.local back to local mode
 *
 * Needs only AWS credentials (aws configure, AWS_PROFILE, SSO or env vars).
 * Extra arguments go to cdk, e.g. npm run aws:deploy -- -c matchData=dfl
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { AWS_ENV_KEYS, STACK_NAME, mergeEnv, outputsToEnv, type StackOutputs } from './env';

const CDK_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(CDK_DIR, '..');
const ENV_LOCAL = resolve(REPO_ROOT, '.env.local');
const ENV_EXAMPLE = resolve(REPO_ROOT, '.env.example');
const OUTPUTS_FILE = resolve(CDK_DIR, 'cdk-outputs.json');
const DEFAULT_REGION = 'eu-central-1';

function fail(message: string): never {
  console.error(`\n[aws] ${message}`);
  process.exit(1);
}

function cdk(args: string[], region: string): void {
  console.log(`\n[aws] cdk ${args.join(' ')}`);
  const res = spawnSync('npx', ['cdk', ...args], {
    cwd: CDK_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, AWS_REGION: region, CDK_DEFAULT_REGION: region, CDK_DISABLE_VERSION_CHECK: '1' },
  });
  if (res.status !== 0) fail(`cdk ${args[0]} failed (exit ${res.status ?? 'signal'}). See the output above.`);
}

async function resolveRegion(): Promise<string> {
  const fromEnv = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (fromEnv) return fromEnv;
  try {
    return (await new STSClient({}).config.region()) || DEFAULT_REGION;
  } catch {
    return DEFAULT_REGION; // no region configured anywhere
  }
}

async function whoAmI(region: string): Promise<string> {
  try {
    const id = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
    return id.Account!;
  } catch (err) {
    fail(
      [
        `No usable AWS credentials (${(err as Error).name}: ${(err as Error).message}).`,
        '  Configure them first, then rerun npm run aws:deploy:',
        '    aws configure                      # access key + secret, or',
        '    aws sso login --profile <name>     # and export AWS_PROFILE=<name>',
      ].join('\n'),
    );
  }
}

function readEnvLocal(): string {
  if (existsSync(ENV_LOCAL)) return readFileSync(ENV_LOCAL, 'utf-8');
  return existsSync(ENV_EXAMPLE) ? readFileSync(ENV_EXAMPLE, 'utf-8') : '';
}

async function deploy(passThrough: string[]): Promise<void> {
  const region = await resolveRegion();
  const account = await whoAmI(region);
  console.log(`[aws] Deploying PitchPulse to account ${account}, region ${region}`);

  cdk(['bootstrap', `aws://${account}/${region}`], region);
  cdk(
    ['deploy', STACK_NAME, '--require-approval', 'never', '--outputs-file', OUTPUTS_FILE, ...passThrough],
    region,
  );

  const outputs = JSON.parse(readFileSync(OUTPUTS_FILE, 'utf-8')) as StackOutputs;
  const env = outputsToEnv(outputs);
  writeFileSync(ENV_LOCAL, mergeEnv(readEnvLocal(), env), 'utf-8');

  const secretArn = outputs[STACK_NAME]?.DemoPasswordSecretArn;
  const secret = secretArn
    ? await new SecretsManagerClient({ region }).send(new GetSecretValueCommand({ SecretId: secretArn }))
    : undefined;

  console.log(
    [
      '',
      '[aws] Done. .env.local now points the app at your stack.',
      `      Demo password: ${secret?.SecretString ?? '(read it from Secrets Manager: DemoPasswordSecretArn)'}`,
      '',
      '      Next: npm run dev, open http://127.0.0.1:5173/demo and sign in with that password.',
      '      When finished: npm run aws:destroy (deletes everything this created).',
    ].join('\n'),
  );
}

async function destroy(passThrough: string[]): Promise<void> {
  const region = await resolveRegion();
  await whoAmI(region);
  cdk(['destroy', STACK_NAME, '--force', ...passThrough], region);
  if (existsSync(ENV_LOCAL)) {
    const blank = Object.fromEntries(AWS_ENV_KEYS.map((k) => [k, '']));
    writeFileSync(ENV_LOCAL, mergeEnv(readFileSync(ENV_LOCAL, 'utf-8'), blank), 'utf-8');
    console.log('[aws] Stack deleted; .env.local switched back to local mode.');
  }
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'deploy') void deploy(rest);
else if (command === 'destroy') void destroy(rest);
else fail('Usage: tsx cdk/scripts/deploy.ts deploy|destroy [cdk args]');
