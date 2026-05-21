#!/usr/bin/env node
/**
 * CDK app entrypoint for PitchPulse.
 *
 * Single stack, single account/region. The hackathon brief targets the
 * sandbox account 058755927272 in eu-central-1 — the same account that owns
 * the source XML bucket — so cross-account permissions are not needed.
 */

import * as cdk from 'aws-cdk-lib';
import { PitchPulseStack } from '../lib/pitchpulse-stack';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT ?? '058755927272';
const region = process.env.CDK_DEFAULT_REGION ?? 'eu-central-1';

new PitchPulseStack(app, 'PitchPulseStack', {
  env: { account, region },
  description: 'PitchPulse - real-time Bundesliga matchday companion (DFL Fan Squad challenge submission).',
  tags: {
    Project: 'PitchPulse',
    Hackathon: 'DFL-Fan-Squad',
    Owner: 'PitchPulse-team',
  },
});
