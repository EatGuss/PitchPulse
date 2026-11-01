/**
 * Pure helpers for npm run aws:deploy / aws:destroy — kept separate so the
 * .env.local handling can be tested without AWS.
 */

export const STACK_NAME = 'PitchPulseStack';

/** The frontend vars that switch the app into AWS mode. */
export const AWS_ENV_KEYS = [
  'VITE_APPSYNC_URL',
  'VITE_APPSYNC_REGION',
  'VITE_COGNITO_USER_POOL_CLIENT_ID',
] as const;

export type StackOutputs = Record<string, Record<string, string>>;

/** Map `cdk deploy --outputs-file` JSON to the frontend env vars. */
export function outputsToEnv(outputs: StackOutputs): Record<string, string> {
  const o = outputs[STACK_NAME];
  if (!o) throw new Error(`No outputs for ${STACK_NAME} in the outputs file`);
  const pick = (key: string) => {
    const v = o[key];
    if (!v) throw new Error(`Stack output ${key} is missing`);
    return v;
  };
  return {
    VITE_APPSYNC_URL: pick('AppSyncGraphQLUrl'),
    VITE_APPSYNC_REGION: pick('Region'),
    VITE_COGNITO_USER_POOL_CLIENT_ID: pick('UserPoolClientId'),
  };
}

/**
 * Set KEY=value lines in a dotenv file's text, keeping every other line
 * (comments, unrelated vars, order) as it was. Missing keys are appended.
 */
export function mergeEnv(existing: string, updates: Record<string, string>): string {
  const pending = new Map(Object.entries(updates));
  const lines = existing.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const out = lines.map((line) => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!m || !pending.has(m[1]!)) return line;
    const value = pending.get(m[1]!)!;
    pending.delete(m[1]!);
    return `${m[1]}=${value}`;
  });
  for (const [k, v] of pending) out.push(`${k}=${v}`);
  return `${out.join('\n')}\n`;
}
