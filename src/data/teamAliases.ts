/**
 * Display aliases for anonymized XML team IDs.
 *
 * Names are sourced from MatchInformations_Anonym.xml in the S3 Match-Events
 * folder (parsed to public/match-info.json via npm run parse). useMatchData()
 * refreshes the snapshot once match-info loads.
 */

import type { MatchInfo, TeamLite } from '../domain/types';

export interface TeamAlias {
  code: string;
  short: string;
  full: string;
  accent: string;
}

/** Fallback until /match-info.json loads — mirrors MatchInformations_Anonym.xml. */
const FALLBACK_TEAMS: MatchInfo['teams'] = {
  home: {
    id: 'DFL-CLU-000001',
    role: 'home',
    xmlName: 'FC Team',
    xmlShortName: 'Team',
    xmlThreeLetterCode: 'FCT',
    players: [],
  },
  guest: {
    id: 'DFL-CLU-000002',
    role: 'guest',
    xmlName: 'Club',
    xmlShortName: 'Club',
    xmlThreeLetterCode: 'CLU',
    players: [],
  },
};

let matchTeams: MatchInfo['teams'] = FALLBACK_TEAMS;

export function setMatchTeamNames(teams: MatchInfo['teams']): void {
  matchTeams = teams;
}

export function getMatchTeamNames(): MatchInfo['teams'] {
  return matchTeams;
}

function aliasFromTeam(team: TeamLite): TeamAlias {
  return {
    code: team.xmlThreeLetterCode,
    short: team.xmlShortName,
    full: team.xmlName,
    accent: team.role === 'home' ? '#DC0714' : '#FDE100',
  };
}

/** @deprecated Use teamAlias(teamId) — kept for promptTemplates import stability. */
export const TEAM_ALIASES: Record<string, TeamAlias> = new Proxy({} as Record<string, TeamAlias>, {
  get(_target, prop: string) {
    const teams = getMatchTeamNames();
    if (prop === teams.home.id) return aliasFromTeam(teams.home);
    if (prop === teams.guest.id) return aliasFromTeam(teams.guest);
    return undefined;
  },
});

export function teamAlias(teamId: string | undefined): TeamAlias {
  const teams = getMatchTeamNames();
  if (teamId === teams.home.id) return aliasFromTeam(teams.home);
  if (teamId === teams.guest.id) return aliasFromTeam(teams.guest);
  const code = (teamId ?? 'UNK').split('-').pop()?.slice(-3).toUpperCase() ?? 'UNK';
  return { code, short: code, full: code, accent: '#7A8294' };
}

export function generateWatchRoomName(): string {
  const teams = getMatchTeamNames();
  const choices = [teams.home, teams.guest];
  const idx = crypto.getRandomValues(new Uint8Array(1))[0]! % choices.length;
  return `${choices[idx]!.xmlShortName} Watchers`;
}
