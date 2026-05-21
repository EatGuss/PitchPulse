/**
 * AWS configuration surface.
 *
 * Reads the three Vite env vars set by the CDK deploy step. If all three are
 * present we run in "AWS mode" — the AppSync bridge takes over event sourcing
 * and the local MatchSim becomes a pure event display layer. If any are
 * missing we fall back to the in-browser MatchSim from Gates 1–3.
 *
 * Mode resolution happens once at module load — no hot-reloading between
 * modes during a session.
 */

const url = import.meta.env.VITE_APPSYNC_URL;
const region = import.meta.env.VITE_APPSYNC_REGION;
const identityPoolId = import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID;

export const awsConfig = {
  url,
  region,
  identityPoolId,
} as const;

/** True iff every required AWS env var is set — used to feature-flag AWS mode. */
export const isAwsMode = Boolean(url && region && identityPoolId);

/** Hard-coded for MVP — the single match the hackathon brief targets. */
export const MATCH_ID = 'DFL-MAT-000001';
