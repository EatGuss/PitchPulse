/** Collectible ranked titles (matches pp-ranked-handler TITLE_NAMES). */

export interface TitleDefinition {
  id: string;
  name: string;
  /** Shown on unlocked tiles in Me → Titles. */
  hint: string;
}

export const TITLE_CATALOG: TitleDefinition[] = [
  {
    id: 'sharpshooter',
    name: 'Sharpshooter',
    hint: '70%+ lifetime ranked accuracy · 30+ shots',
  },
  {
    id: 'sniper',
    name: 'Sniper',
    hint: '80%+ lifetime ranked accuracy · 50+ shots',
  },
  {
    id: 'oracle',
    name: 'Oracle',
    hint: '90%+ lifetime ranked accuracy · 100+ shots',
  },
  {
    id: 'analyst',
    name: 'Analyst',
    hint: '100+ ranked matches played',
  },
  {
    id: 'veteran',
    name: 'Veteran',
    hint: '500+ ranked matches played',
  },
  {
    id: 'hot-take-hero',
    name: 'Hot Take Hero',
    hint: 'Won a hot take in a ranked match',
  },
  {
    id: 'comeback-king',
    name: 'Comeback King',
    hint: 'Won ranked after trailing 200+ pts at HT',
  },
  {
    id: 'perfect-match',
    name: 'Perfect Match',
    hint: '100% accuracy in one ranked match (6+ shots)',
  },
];

export function titleById(id: string): TitleDefinition | undefined {
  return TITLE_CATALOG.find((t) => t.id === id);
}

export function titleDisplayName(id: string): string {
  return titleById(id)?.name ?? id;
}
