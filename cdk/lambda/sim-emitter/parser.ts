/**
 * Pure-function port of scripts/parse-match-xml.ts.
 *
 * Identical normalization logic, but takes XML strings as input (so the
 * Lambda can pipe S3 GetObject output straight in) instead of reading files
 * from disk. The local parse script reads /data/*.xml off the developer's
 * laptop; this module reads it out of S3 on cold start.
 *
 * Why duplicated rather than imported across packages: cdk/ has its own
 * tsconfig + bundle (esbuild via NodejsFunction). Cross-package TS imports
 * complicate the Lambda bundle considerably for one file's worth of logic.
 *
 * If you change one, change BOTH:
 *   scripts/parse-match-xml.ts   (laptop)
 *   cdk/lambda/sim-emitter/parser.ts  (Lambda)
 */

import { XMLParser } from 'fast-xml-parser';

// ─── Types (mirrored from src/domain/types.ts) ─────────────────────────────

export type NormalizedEventType =
  | 'kickOff'
  | 'goal'
  | 'shotMissed'
  | 'shotSaved'
  | 'shotBlocked'
  | 'card'
  | 'substitution'
  | 'corner'
  | 'foul'
  | 'offside'
  | 'penalty'
  | 'halfTime'
  | 'fullTime'
  | 'stoppageTimeAnnounced';

export type MatchPhase = 'preMatch' | 'firstHalf' | 'halfTime' | 'secondHalf' | 'fullTime';

export type KickOffRole = 'firstHalfStart' | 'secondHalfStart' | 'restart';

export interface NormalizedEvent {
  id: string;
  type: NormalizedEventType;
  matchMinute: number;
  displayMinute: string;
  matchPhase: MatchPhase;
  eventTimeIso: string;
  kickOffRole?: KickOffRole;
  teamId?: string;
  playerId?: string;
  assistPlayerId?: string;
  cardColor?: 'yellow' | 'yellowRed' | 'red';
  reason?: string;
  scoreAfter?: { home: number; guest: number };
}

export interface MatchInfoLite {
  matchId: string;
  competitionName: string;
  matchDay: number;
  homeTeamId: string;
  guestTeamId: string;
  finalResult: string;
}

export interface ParsedMatch {
  info: MatchInfoLite;
  events: NormalizedEvent[];
  firstKickoffIso: string;
  secondKickoffIso: string | null;
}

// ─── XML parser setup ──────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) =>
    ['Event', 'Team', 'Player', 'Trainer', 'Referee'].includes(name),
  parseAttributeValue: false,
});

interface RawEvent {
  '@_EventId': string;
  '@_EventTime': string;
  '@_MatchId': string;
  [k: string]: unknown;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function firstChildElementName(ev: RawEvent): string | null {
  for (const k of Object.keys(ev)) {
    if (!k.startsWith('@_')) return k;
  }
  return null;
}

function findDescendant(obj: unknown, name: string): Record<string, unknown> | null {
  if (!isObj(obj)) return null;
  for (const k of Object.keys(obj)) {
    if (k.startsWith('@_')) continue;
    if (k === name && isObj((obj as Record<string, unknown>)[k])) {
      return (obj as Record<string, unknown>)[k] as Record<string, unknown>;
    }
    const sub = findDescendant((obj as Record<string, unknown>)[k], name);
    if (sub) return sub;
  }
  return null;
}

function classify(ev: RawEvent): {
  type: NormalizedEventType | null;
  payload: Record<string, unknown>;
} {
  // Goal detection FIRST — penalty goals nest as <Penalty><ShotAtGoal><SuccessfulShot>.
  const successful = findDescendant(ev, 'SuccessfulShot');
  if (successful) {
    const shotAtGoal = findDescendant(ev, 'ShotAtGoal') ?? {};
    const cr = String(successful['@_CurrentResult'] ?? '0:0');
    const [h, g] = cr.split(':').map(Number);
    return {
      type: 'goal',
      payload: {
        teamId: shotAtGoal['@_Team'] !== undefined ? String(shotAtGoal['@_Team']) : undefined,
        playerId: shotAtGoal['@_Player'] !== undefined ? String(shotAtGoal['@_Player']) : undefined,
        assistPlayerId: successful['@_Assist'] !== undefined ? String(successful['@_Assist']) : undefined,
        scoreAfter: { home: h, guest: g },
      },
    };
  }
  if (findDescendant(ev, 'ShotWide')) {
    const shotAtGoal = findDescendant(ev, 'ShotAtGoal') ?? {};
    return { type: 'shotMissed', payload: { teamId: String(shotAtGoal['@_Team'] ?? ''), playerId: String(shotAtGoal['@_Player'] ?? '') } };
  }
  if (findDescendant(ev, 'SavedShot')) {
    const shotAtGoal = findDescendant(ev, 'ShotAtGoal') ?? {};
    return { type: 'shotSaved', payload: { teamId: String(shotAtGoal['@_Team'] ?? ''), playerId: String(shotAtGoal['@_Player'] ?? '') } };
  }
  if (findDescendant(ev, 'BlockedShot')) {
    const shotAtGoal = findDescendant(ev, 'ShotAtGoal') ?? {};
    return { type: 'shotBlocked', payload: { teamId: String(shotAtGoal['@_Team'] ?? ''), playerId: String(shotAtGoal['@_Player'] ?? '') } };
  }

  const childName = firstChildElementName(ev);
  if (!childName) return { type: null, payload: {} };
  const child = ev[childName] as Record<string, unknown>;
  if (!isObj(child)) return { type: null, payload: {} };

  switch (childName) {
    case 'KickOff':
      return { type: 'kickOff', payload: {} };
    case 'Caution':
      return {
        type: 'card',
        payload: {
          teamId: String(child['@_Team']),
          playerId: String(child['@_Player']),
          cardColor: String(child['@_CardColor']),
          reason: String(child['@_Reason'] ?? child['@_OtherReason'] ?? 'unknown'),
        },
      };
    case 'Substitution':
      return { type: 'substitution', payload: { teamId: String(child['@_Team'] ?? '') } };
    case 'CornerKick':
      return { type: 'corner', payload: { teamId: String(child['@_Team'] ?? '') } };
    case 'Foul':
      // DFL XML attribute names on <Foul>: Fouler (player), TeamFouler (team),
      // FoulType ("foul" | "handBall" | ...). Mirror scripts/parse-match-xml.ts.
      return {
        type: 'foul',
        payload: {
          teamId: child['@_TeamFouler'] !== undefined ? String(child['@_TeamFouler']) : undefined,
          playerId: child['@_Fouler'] !== undefined ? String(child['@_Fouler']) : undefined,
          reason: child['@_FoulType'] !== undefined ? String(child['@_FoulType']) : undefined,
        },
      };
    case 'Offside':
      return {
        type: 'offside',
        payload: {
          teamId: child['@_Team'] !== undefined ? String(child['@_Team']) : undefined,
          playerId: child['@_Player'] !== undefined ? String(child['@_Player']) : undefined,
        },
      };
    case 'Penalty':
      return { type: 'penalty', payload: { teamId: String(child['@_Team'] ?? '') } };
    case 'AdditionalTimeDisplayed':
      return { type: 'stoppageTimeAnnounced', payload: {} };
    case 'FinalWhistle': {
      const section = String(child['@_GameSection']);
      const finalResult = String(child['@_FinalResult'] ?? '0:0');
      const [h, g] = finalResult.split(':').map(Number);
      return {
        type: section === 'firstHalf' ? 'halfTime' : 'fullTime',
        payload: { scoreAfter: { home: h, guest: g } },
      };
    }
    default:
      return { type: null, payload: {} };
  }
}

export const SECOND_HALF_START_MINUTE = 46;

export function formatDisplayClock(matchMinute: number, phase: MatchPhase): string {
  if (phase === 'halfTime') return 'HT';
  if (phase === 'fullTime') return 'FT';
  if (phase === 'firstHalf' && matchMinute >= 45) {
    const capped = Math.min(matchMinute, SECOND_HALF_START_MINUTE - 0.001);
    if (capped < 45 + 0.005) return "45'";
    const added = Math.ceil((capped - 45 - 0.004) / 0.01);
    return `45+${Math.max(1, added)}'`;
  }
  if (phase === 'secondHalf') {
    const minute = Math.floor(matchMinute);
    if (minute > 90) return `90+${minute - 90}'`;
    return `${Math.max(SECOND_HALF_START_MINUTE, minute)}'`;
  }
  return `${Math.floor(matchMinute)}'`;
}

function resolveKickOffRole(
  eventTimeIso: string,
  gameSection: string,
  firstKickoffIso: string,
  secondKickoffIso: string | null,
): KickOffRole {
  if (eventTimeIso === firstKickoffIso && gameSection === 'firstHalf') return 'firstHalfStart';
  if (secondKickoffIso && eventTimeIso === secondKickoffIso) return 'secondHalfStart';
  return 'restart';
}

function adjustKickOffTiming(
  type: NormalizedEventType | null,
  kickOffRole: KickOffRole | undefined,
  matchMinute: number,
  matchPhase: MatchPhase,
): { matchMinute: number; matchPhase: MatchPhase } {
  if (type !== 'kickOff' || !kickOffRole) return { matchMinute, matchPhase };
  if (kickOffRole === 'secondHalfStart') {
    return {
      matchMinute: Math.max(matchMinute, SECOND_HALF_START_MINUTE),
      matchPhase: 'secondHalf',
    };
  }
  if (kickOffRole === 'firstHalfStart') {
    return { matchMinute: 0, matchPhase: 'firstHalf' };
  }
  return { matchMinute, matchPhase };
}

function finalizeHalfTimeTimeline(events: NormalizedEvent[]): void {
  const ht = events.find((e) => e.type === 'halfTime');
  const ko2 = events.find((e) => e.kickOffRole === 'secondHalfStart');
  if (!ht) return;

  const oldHtMin = ht.matchMinute;
  const stoppage1H = events.find(
    (e) => e.type === 'stoppageTimeAnnounced' && e.matchPhase === 'firstHalf',
  );
  const preHtLate = events
    .filter(
      (e) =>
        e.matchPhase === 'firstHalf' &&
        e.type !== 'stoppageTimeAnnounced' &&
        e.matchMinute > 44 &&
        e.matchMinute < oldHtMin + 0.01,
    )
    .sort((a, b) => a.matchMinute - b.matchMinute);

  if (stoppage1H) {
    stoppage1H.matchMinute = 45;
    stoppage1H.matchPhase = 'firstHalf';
    stoppage1H.displayMinute = formatDisplayClock(45, 'firstHalf');
  }

  let slot = 45;
  for (const e of preHtLate) {
    slot += 0.01;
    e.matchMinute = Number(slot.toFixed(3));
    e.matchPhase = 'firstHalf';
    e.displayMinute = formatDisplayClock(e.matchMinute, 'firstHalf');
  }

  const addedSlots = Math.max(
    preHtLate.length,
    stoppage1H?.stoppageMinutes ?? 0,
    1,
  );
  const htMinute = Number((45 + addedSlots * 0.01 + 0.01).toFixed(3));

  for (const e of events) {
    if (e.matchPhase === 'halfTime' && e.type !== 'halfTime') {
      e.matchMinute = htMinute;
      e.displayMinute = 'HT';
    }
  }

  ht.matchMinute = htMinute;
  ht.displayMinute = 'HT';
  ht.matchPhase = 'halfTime';

  if (ko2) {
    ko2.matchMinute = SECOND_HALF_START_MINUTE;
    ko2.displayMinute = formatDisplayClock(SECOND_HALF_START_MINUTE, 'secondHalf');
    ko2.matchPhase = 'secondHalf';

    let slot = SECOND_HALF_START_MINUTE + 0.001;
    for (const e of events) {
      if (e === ko2) continue;
      if (e.matchPhase !== 'secondHalf') continue;
      if (e.matchMinute >= SECOND_HALF_START_MINUTE) continue;
      e.matchMinute = Number(slot.toFixed(3));
      slot += 0.001;
      e.displayMinute = formatDisplayClock(e.matchMinute, 'secondHalf');
    }
  }

  const htIdx = events.findIndex((e) => e.type === 'halfTime');
  if (htIdx >= 0) {
    for (let i = htIdx + 1; i < events.length; i++) {
      const e = events[i];
      if (e.matchPhase !== 'firstHalf') continue;
      e.matchPhase = 'halfTime';
      e.matchMinute = htMinute;
      e.displayMinute = 'HT';
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function parseMatchInfo(xml: string): MatchInfoLite {
  const doc = xmlParser.parse(xml) as Record<string, unknown>;
  const root = doc['PutDataRequest'] as Record<string, unknown>;
  const mi = root['MatchInformation'] as Record<string, unknown>;
  const general = mi['General'] as Record<string, string>;
  const teams = ((mi['Teams'] as Record<string, unknown>)['Team'] ?? []) as Array<Record<string, string>>;
  const home = teams.find((t) => t['@_Role'] === 'home');
  const guest = teams.find((t) => t['@_Role'] === 'guest');
  if (!home || !guest) throw new Error('MatchInformations XML missing home or guest team');
  return {
    matchId: String(general['@_MatchId']),
    competitionName: String(general['@_CompetitionName']),
    matchDay: Number(general['@_MatchDay']),
    homeTeamId: String(home['@_TeamId']),
    guestTeamId: String(guest['@_TeamId']),
    finalResult: String(general['@_Result']),
  };
}

export function parseEvents(xml: string): {
  events: NormalizedEvent[];
  firstKickoffIso: string;
  secondKickoffIso: string | null;
} {
  const doc = xmlParser.parse(xml) as Record<string, unknown>;
  const root = doc['PutDataRequest'] as Record<string, unknown>;
  const all = ((root['Event'] ?? []) as RawEvent[]);

  let firstKickoffIso: string | null = null;
  for (const ev of all) {
    if (firstChildElementName(ev) !== 'KickOff') continue;
    const ko = ev['KickOff'] as Record<string, string>;
    if (String(ko['@_GameSection']) === 'firstHalf' && !firstKickoffIso) {
      firstKickoffIso = String(ev['@_EventTime']);
    }
  }
  if (!firstKickoffIso) throw new Error('No firstHalf KickOff event found');

  const t1 = Date.parse(firstKickoffIso);

  let firstHalfEndIso: string | null = null;
  for (const ev of all) {
    if (firstChildElementName(ev) !== 'FinalWhistle') continue;
    const fw = ev['FinalWhistle'] as Record<string, string>;
    if (String(fw['@_GameSection']) === 'firstHalf') {
      firstHalfEndIso = String(ev['@_EventTime']);
      break;
    }
  }
  const tHt = firstHalfEndIso ? Date.parse(firstHalfEndIso) : Infinity;

  let secondKickoffIso: string | null = null;
  for (const ev of all) {
    if (firstChildElementName(ev) !== 'KickOff') continue;
    const ko = ev['KickOff'] as Record<string, string>;
    if (String(ko['@_GameSection']) !== 'secondHalf') continue;
    const iso = String(ev['@_EventTime']);
    const t = Date.parse(iso);
    if (t <= tHt) continue;
    if (!secondKickoffIso || t < Date.parse(secondKickoffIso)) {
      secondKickoffIso = iso;
    }
  }

  const t2 = secondKickoffIso ? Date.parse(secondKickoffIso) : null;

  const events: NormalizedEvent[] = [];
  for (const ev of all) {
    const { type, payload } = classify(ev);
    if (type === null) continue;
    const tEv = Date.parse(String(ev['@_EventTime']));

    let matchMinute: number;
    let matchPhase: MatchPhase;
    if (tEv < t1) {
      matchMinute = 0;
      matchPhase = 'preMatch';
    } else if (tEv <= tHt) {
      matchMinute = (tEv - t1) / 60_000;
      matchPhase = 'firstHalf';
    } else if (t2 !== null && tEv < t2) {
      matchMinute = 45;
      matchPhase = 'halfTime';
    } else if (t2 !== null) {
      matchMinute = 45 + (tEv - t2) / 60_000;
      matchPhase = 'secondHalf';
    } else {
      matchMinute = 45;
      matchPhase = 'halfTime';
    }
    if (type === 'halfTime') matchPhase = 'halfTime';
    if (type === 'fullTime') matchPhase = 'fullTime';

    const eventTimeIso = String(ev['@_EventTime']);
    const gameSection = type === 'kickOff' ? String(payload['gameSection'] ?? '') : '';
    const kickOffRole =
      type === 'kickOff'
        ? resolveKickOffRole(eventTimeIso, gameSection, firstKickoffIso, secondKickoffIso)
        : undefined;

    const adjusted = adjustKickOffTiming(type, kickOffRole, matchMinute, matchPhase);
    matchMinute = adjusted.matchMinute;
    matchPhase = adjusted.matchPhase;

    events.push({
      id: String(ev['@_EventId']),
      type,
      matchMinute: Number(matchMinute.toFixed(3)),
      displayMinute: formatDisplayClock(matchMinute, matchPhase),
      matchPhase,
      eventTimeIso,
      kickOffRole,
      teamId: payload['teamId'] as string | undefined,
      playerId: payload['playerId'] as string | undefined,
      assistPlayerId: payload['assistPlayerId'] as string | undefined,
      cardColor: payload['cardColor'] as NormalizedEvent['cardColor'] | undefined,
      reason: payload['reason'] as string | undefined,
      scoreAfter: payload['scoreAfter'] as NormalizedEvent['scoreAfter'] | undefined,
    });
  }

  finalizeHalfTimeTimeline(events);
  events.sort((a, b) => a.matchMinute - b.matchMinute);
  return { events, firstKickoffIso, secondKickoffIso };
}

export function parseMatchXmlBundle(eventsXml: string, infoXml: string): ParsedMatch {
  const info = parseMatchInfo(infoXml);
  const { events, firstKickoffIso, secondKickoffIso } = parseEvents(eventsXml);
  return { info, events, firstKickoffIso, secondKickoffIso };
}
