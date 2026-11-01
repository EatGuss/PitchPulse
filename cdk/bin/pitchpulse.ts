#!/usr/bin/env node
/**
 * CDK app entrypoint for PitchPulse.
 *
 * Single stack. Deploys to whichever account your AWS credentials resolve to
 * (the CDK CLI sets CDK_DEFAULT_ACCOUNT/REGION from them); region defaults to
 * eu-central-1. The original hackathon sandbox was 058755927272 — only that
 * account can use -c matchData=dfl (see lib/pitchpulse-stack.ts).
 */

import * as cdk from 'aws-cdk-lib';
import { PitchPulseStack } from '../lib/pitchpulse-stack';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
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
