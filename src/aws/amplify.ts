/**
 * Amplify v6 single-shot configuration.
 *
 * Import this module once from src/main.tsx BEFORE any component that uses
 * the AppSync client. Only the GraphQL endpoint is configured: every request
 * uses the AWS_LAMBDA auth mode with a per-call Cognito ID token supplied by
 * src/aws/session.ts, so Amplify Auth (one user per tab) is not used at all.
 *
 * Safe to import in local-mode builds — the function no-ops if AWS env vars
 * are not set, so the same bundle works for both deploy targets.
 */

import { Amplify } from 'aws-amplify';
import { awsConfig, isAwsMode } from './config';

let configured = false;

export function configureAmplifyOnce(): void {
  if (configured) return;
  if (!isAwsMode) {
    console.info('[amplify] skipped: AWS env vars not set; running in local-only mode');
    return;
  }

  Amplify.configure({
    API: {
      GraphQL: {
        endpoint: awsConfig.url!,
        region: awsConfig.region!,
        defaultAuthMode: 'lambda',
      },
    },
  } as Parameters<typeof Amplify.configure>[0]);

  configured = true;
  console.info('[amplify] configured for AppSync @ %s', awsConfig.url);
}
