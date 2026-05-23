/** How the user enters the matchday experience (Gate B — Mode Picker). */
export type PlayMode = 'public' | 'watchRoom';

export function isPlayMode(value: string | null): value is PlayMode {
  return value === 'public' || value === 'watchRoom';
}
