/** Primary bottom navigation tabs (Gate C restructure). */
export type AppTab = 'home' | 'compete' | 'standings' | 'me';

export type CompeteView = 'root' | 'ranked' | 'watchRoom';

export function isAppTab(value: string | null): value is AppTab {
  return value === 'home' || value === 'compete' || value === 'standings' || value === 'me';
}

export function isCompeteView(value: string | null): value is CompeteView {
  return value === 'root' || value === 'ranked' || value === 'watchRoom';
}

export const APP_TABS: ReadonlyArray<{ id: AppTab; label: string; icon: string }> = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'compete', label: 'Compete', icon: '⚔️' },
  { id: 'standings', label: 'Standings', icon: '🏆' },
  { id: 'me', label: 'Me', icon: '👤' },
];
