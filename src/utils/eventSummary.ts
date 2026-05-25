/**
 * Compact event labels for Home "What's Live" rows.
 */

import type { MatchInfo, NormalizedEvent } from '../domain/types';

export interface EventSummary {
  id: string;
  headline: string;
  subline?: string;
}

function sideLabel(teamId: string | undefined, info: MatchInfo): string {
  if (!teamId) return '';
  return teamId === info.teams.home.id ? 'Home' : 'Away';
}

export function summarizeEvent(event: NormalizedEvent, info: MatchInfo): EventSummary {
  const side = sideLabel(event.teamId, info);
  const minute = event.displayMinute;

  switch (event.type) {
    case 'goal':
      return {
        id: event.id,
        headline: `GOAL — ${minute}${side ? ` ${side}` : ''}`,
        subline: event.scoreAfter
          ? `${event.scoreAfter.home}–${event.scoreAfter.guest}`
          : undefined,
      };
    case 'card': {
      const color = event.cardColor === 'red' || event.cardColor === 'yellowRed' ? 'RED' : 'YELLOW';
      return {
        id: event.id,
        headline: `${color} CARD — ${minute}${side ? ` ${side}` : ''}`,
      };
    }
    case 'kickOff':
      return {
        id: event.id,
        headline: `KICKOFF — ${minute}`,
        subline: `${info.teams.home.xmlShortName} v ${info.teams.guest.xmlShortName}`,
      };
    case 'halfTime':
      return {
        id: event.id,
        headline: `HALF TIME — ${minute}`,
        subline: event.scoreAfter
          ? `${event.scoreAfter.home}–${event.scoreAfter.guest}`
          : undefined,
      };
    case 'fullTime':
      return {
        id: event.id,
        headline: 'FULL TIME',
        subline: event.scoreAfter
          ? `Final ${event.scoreAfter.home}–${event.scoreAfter.guest}`
          : undefined,
      };
    default:
      return {
        id: event.id,
        headline: `${event.type.toUpperCase()} — ${minute}`,
      };
  }
}
