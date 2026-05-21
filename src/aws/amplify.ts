/**
 * Amplify v6 single-shot configuration.
 *
 * Import this module once from src/main.tsx BEFORE any component that uses
 * the AppSync client. Calls Amplify.configure() with the AppSync endpoint
 * and the Cognito Identity Pool — anonymous (guest) access is enabled so
 * users don't need to log in.
 *
 * Safe to import in local-mode builds — the function no-ops if AWS env vars
 * are not set, so the same bundle works for both deploy targets.
 */

import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';
import { awsConfig, isAwsMode } from './config';

let configured = false;

export function configureAmplifyOnce(): void {
  if (configured) return;
  if (!isAwsMode) {
    console.info('[amplify] skipped: AWS env vars not set; running in local-only mode');
    return;
  }

  // Identity-Pool-only setup: omit userPoolId / userPoolClientId entirely so
  // Amplify treats this as anonymous-only. Passing `undefined` for those keys
  // tripped Amplify v6's strict config validation in our first deploy.
  Amplify.configure({
    Auth: {
      Cognito: {
        identityPoolId: awsConfig.identityPoolId!,
        allowGuestAccess: true,
      },
    },
    API: {
      GraphQL: {
        endpoint: awsConfig.url!,
        region: awsConfig.region!,
        defaultAuthMode: 'iam',
      },
    },
  } as Parameters<typeof Amplify.configure>[0]);

  configured = true;
  console.info('[amplify] configured for AppSync @ %s', awsConfig.url);

  // Warm Cognito anonymous credentials so the first GraphQL subscription's
  // SigV4 signing has creds in hand. Without this, Amplify v6 sometimes opens
  // the WebSocket before creds resolve and the handshake fails silently.
  void (async () => {
    try {
      const sess = await fetchAuthSession({ forceRefresh: false });
      console.info(
        '[amplify] cognito session ready: identityId=%s creds=%s',
        sess.identityId ?? '(none)',
        sess.credentials ? 'yes' : 'no',
      );
    } catch (err) {
      console.error('[amplify] cognito session fetch failed', err);
    }
  })();
}
