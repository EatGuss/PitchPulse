/** Collectible ranked titles (matches pp-ranked-handler TITLE_NAMES). */

export interface TitleDefinition {
  id: string;
  name: string;
  hint: string;
}

export const TITLE_CATALOG: TitleDefinition[] = [
  { id: 'sharpshooter', name: 'Sharpshooter', hint: 'Strong ranked accuracy' },
  { id: 'sniper', name: 'Sniper', hint: 'Hit streaks in ranked' },
  { id: 'oracle', name: 'Oracle', hint: 'Read the match flow' },
  { id: 'analyst', name: 'Analyst', hint: 'Consistent pick quality' },
  { id: 'veteran', name: 'Veteran', hint: 'Many ranked matches played' },
  { id: 'hot-take-hero', name: 'Hot Take Hero', hint: 'Win a Hot Take vote' },
  { id: 'comeback-king', name: 'Comeback King', hint: 'Win from behind' },
  { id: 'perfect-match', name: 'Perfect Match', hint: 'Flawless ranked run' },
];

export function titleById(id: string): TitleDefinition | undefined {
  return TITLE_CATALOG.find((t) => t.id === id);
}

export function titleDisplayName(id: string): string {
  return titleById(id)?.name ?? id;
}
