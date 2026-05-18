/**
 * Display aliases for the anonymized XML team IDs.
 *
 * Per project decision (Gate 0 review): we override the anonymized "FC Team" / "Club"
 * with FC Bayern (FCB) / Borussia Dortmund (BVB) for demo narrative.
 *
 * Hard rules (Challenge brief — no licensed marks):
 *   - Text only. NEVER load club logos, crests, kit images, or player photos.
 *   - `accent` is used as a subtle accent dot on user-team chips ONLY.
 *     Primary UI accent stays Bundesliga red (#E10E1F, var(--pp-accent)).
 *
 * Single source of truth — flipping or anonymizing later is one edit here.
 */

export interface TeamAlias {
  code: string;       // 3-letter code shown in score chips / leaderboards
  short: string;      // 1-word short name shown in compact contexts
  full: string;       // Full display name shown in headers / onboarding
  accent: string;     // Hex accent used ONLY as user-team dot, never for affordances
}

export const TEAM_ALIASES: Record<string, TeamAlias> = {
  'DFL-CLU-000001': {
    code: 'FCB',
    short: 'Bayern',
    full: 'FC Bayern',
    accent: '#DC0714',
  },
  'DFL-CLU-000002': {
    code: 'BVB',
    short: 'Dortmund',
    full: 'Borussia Dortmund',
    accent: '#FDE100',
  },
};

export function teamAlias(teamId: string | undefined): TeamAlias {
  if (teamId && TEAM_ALIASES[teamId]) return TEAM_ALIASES[teamId];
  // Fallback so unknown IDs render as their last segment instead of crashing.
  const code = (teamId ?? 'UNK').split('-').pop()?.slice(-3).toUpperCase() ?? 'UNK';
  return { code, short: code, full: code, accent: '#7A8294' };
}
