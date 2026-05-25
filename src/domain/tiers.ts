/** Ranked tier ladder — names only, no ELO numerics. */
export type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND' | 'CHAMPION';

export const TIER_LABELS: Record<Tier, string> = {
  BRONZE: 'Bronze',
  SILVER: 'Silver',
  GOLD: 'Gold',
  DIAMOND: 'Diamond',
  CHAMPION: 'Champion',
};

/** Tier shield colors for badges and promotion animation (Gate D). */
export const TIER_COLORS: Record<Tier, { fg: string; bg: string; glow: string }> = {
  BRONZE: { fg: '#E8C4A0', bg: '#8B5A2B', glow: 'rgba(184, 115, 51, 0.45)' },
  SILVER: { fg: '#F0F0F0', bg: '#8A8A8A', glow: 'rgba(192, 192, 192, 0.45)' },
  GOLD: { fg: '#FFF4C2', bg: '#C9A227', glow: 'rgba(255, 215, 0, 0.4)' },
  DIAMOND: { fg: '#E0FFFF', bg: '#0891B2', glow: 'rgba(0, 229, 255, 0.4)' },
  CHAMPION: { fg: '#FFE8A3', bg: '#E10E1F', glow: 'rgba(225, 14, 31, 0.5)' },
};

export const WINS_TO_ADVANCE: Record<Tier, number | null> = {
  BRONZE: 5,
  SILVER: 5,
  GOLD: 8,
  DIAMOND: 10,
  CHAMPION: null,
};
