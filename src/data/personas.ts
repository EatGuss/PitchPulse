/**
 * Hardcoded demo personas — no signup flow per challenge brief (Cognito Identity
 * Pool only, anonymous, two pre-created users with fixed IDs).
 *
 * Archetypes are sourced from data/Hackaton_FanPersonas.pdf:
 *   - Markus (28, Casual fan, Berlin)  → Alice
 *   - Nina   (25, Casual × On-Demand × Socially Conscious, Dortmund) → Bob
 *
 * The persona axis affects DISPLAY ONLY (tagline, accent, UI copy). It NEVER
 * affects gameplay or rewards — game logic stays identical for both users so
 * the multiplayer pillar is fair.
 */

export interface DemoUser {
  id: string;
  displayName: string;
  avatar: string;            // emoji for MVP — no licensed athlete imagery
  favoriteTeamId: string;
  archetypeId: 'markus' | 'nina';
  archetypeName: string;
  tagline: string;
}

export const DEMO_USERS: Record<string, DemoUser> = {
  alice: {
    id: 'alice',
    displayName: 'Alice',
    avatar: '🦁',
    favoriteTeamId: 'DFL-CLU-000001', // FCB
    archetypeId: 'markus',
    archetypeName: 'The Casual Fan',
    tagline: "I'm here for the good vibes and great moments.",
  },
  bob: {
    id: 'bob',
    displayName: 'Bob',
    avatar: '🐝',
    favoriteTeamId: 'DFL-CLU-000002', // BVB
    archetypeId: 'nina',
    archetypeName: 'The Moment-Led Fan',
    tagline: 'I am passionate — but not in the traditional way.',
  },
};

export type DemoUserId = keyof typeof DEMO_USERS;
