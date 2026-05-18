/**
 * Parses the DFL match XML (Events_Anonym.xml + MatchInformations_Anonym.xml)
 * into a normalized JSON event stream suitable for the in-browser MatchSim.
 *
 * Run with: npm run parse  (Vite's `predev`/`prebuild` hooks invoke it automatically.)
 *
 * Output:
 *   - public/match-info.json  → teams, kickoff, lineups
 *   - public/events.json      → ordered events with derived matchMinute
 *
 * Match-minute anchoring (PITCHPULSE.md §7.3, ADR-001 — match clock is authoritative):
 *   - 1H anchor = EventTime of first <KickOff GameSection="firstHalf">  → minute 0
 *   - 2H anchor = EventTime of first <KickOff GameSection="secondHalf"> → minute 45
 *   - Events between 1H final whistle and 2H kickoff are tagged matchPhase="halfTime".
 *
 * We deliberately DO NOT cross-reference MatchInformations.KickoffTime — the two files
 * use different timezone offsets (+00:00 vs +02:00) and the only reliable anchor is the
 * first KickOff event itself.
 */

import { XMLParser } from 'fast-xml-parser';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const EVENTS_XML = resolve(REPO_ROOT, 'data/Match-Events/Events_Anonym.xml');
const INFO_XML = resolve(REPO_ROOT, 'data/Match-Events/MatchInformations_Anonym.xml');
const OUT_DIR = resolve(REPO_ROOT, 'public');
const OUT_EVENTS = resolve(OUT_DIR, 'events.json');
const OUT_INFO = resolve(OUT_DIR, 'match-info.json');

// ─── Types (mirrored from src/domain/types.ts so this script has no @/ alias dep) ──

type NormalizedEventType =
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

type MatchPhase = 'preMatch' | 'firstHalf' | 'halfTime' | 'secondHalf' | 'fullTime';

interface NormalizedEvent {
  id: string;
  type: NormalizedEventType;
  matchMinute: number; // float, e.g. 23.47
  displayMinute: string; // "23'" or "45+2'"
  matchPhase: MatchPhase;
  eventTimeIso: string;
  teamId?: string;
  playerId?: string;
  assistPlayerId?: string;
  cardColor?: 'yellow' | 'yellowRed' | 'red';
  reason?: string;
  scoreAfter?: { home: number; guest: number };
  raw?: Record<string, unknown>; // For debugging only; trimmed in production build.
}

interface PlayerLite {
  id: string;
  shirtNumber: number;
  lastName: string;
  shortName: string;
  starting: boolean;
  position?: string;
}

interface TeamLite {
  id: string;
  role: 'home' | 'guest';
  xmlName: string;
  xmlShortName: string;
  xmlThreeLetterCode: string;
  players: PlayerLite[];
}

interface MatchInfo {
  matchId: string;
  competitionName: string;
  season: string;
  matchDay: number;
  plannedKickoffTime: string;
  kickoffTime: string;
  finalResult: string;
  stadium: { name: string; capacity: number; spectators: number };
  teams: { home: TeamLite; guest: TeamLite };
  totalTimeFirstHalfMs: number;
  totalTimeSecondHalfMs: number;
}

// ─── XML parser setup ──────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Treat these as arrays even when a single occurrence appears.
  isArray: (name) =>
    ['Event', 'Team', 'Player', 'Trainer', 'Referee'].includes(name),
  parseAttributeValue: false,
});

// ─── MatchInformations parsing ─────────────────────────────────────────────────

function parseMatchInfo(): MatchInfo {
  const xml = readFileSync(INFO_XML, 'utf-8');
  const doc = parser.parse(xml);
  const mi = doc.PutDataRequest.MatchInformation;
  const general = mi.General;
  const env = mi.Environment;
  const teamsRaw = mi.Teams.Team as Array<Record<string, unknown> & { Players?: { Player?: Array<Record<string, string>> } }>;

  const toTeam = (t: typeof teamsRaw[number]): TeamLite => {
    const playersRaw = (t.Players?.Player ?? []) as Array<Record<string, string>>;
    return {
      id: String(t['@_TeamId']),
      role: String(t['@_Role']) as 'home' | 'guest',
      xmlName: String(t['@_TeamName']),
      xmlShortName: String(t['@_ShortName']),
      xmlThreeLetterCode: String(t['@_ThreeLetterCode']),
      players: playersRaw.map((p) => ({
        id: String(p['@_PersonId']),
        shirtNumber: Number(p['@_ShirtNumber']),
        lastName: String(p['@_LastName']),
        shortName: String(p['@_Shortname']),
        starting: String(p['@_Starting']) === 'true',
        position: p['@_PlayingPosition'] ? String(p['@_PlayingPosition']) : undefined,
      })),
    };
  };

  const home = teamsRaw.find((t) => t['@_Role'] === 'home');
  const guest = teamsRaw.find((t) => t['@_Role'] === 'guest');
  if (!home || !guest) throw new Error('MatchInformations.xml missing home or guest team');

  const other = mi.OtherGameInformation ?? {};

  return {
    matchId: String(general['@_MatchId']),
    competitionName: String(general['@_CompetitionName']),
    season: String(general['@_Season']),
    matchDay: Number(general['@_MatchDay']),
    plannedKickoffTime: String(general['@_PlannedKickoffTime']),
    kickoffTime: String(general['@_KickoffTime']),
    finalResult: String(general['@_Result']),
    stadium: {
      name: String(env['@_StadiumName']),
      capacity: Number(env['@_StadiumCapacity']),
      spectators: Number(env['@_NumberOfSpectators']),
    },
    teams: { home: toTeam(home), guest: toTeam(guest) },
    totalTimeFirstHalfMs: Number(other['@_TotalTimeFirstHalf'] ?? 0),
    totalTimeSecondHalfMs: Number(other['@_TotalTimeSecondHalf'] ?? 0),
  };
}

// ─── Events parsing ────────────────────────────────────────────────────────────

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
  // The "type" of an event is the first child element (KickOff, ShotAtGoal, Caution, ...).
  // fast-xml-parser exposes children as keys; we ignore the @_-prefixed attributes.
  for (const k of Object.keys(ev)) {
    if (!k.startsWith('@_')) return k;
  }
  return null;
}

/** Recursively find the first descendant element with the given tag name. */
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
  // 1. Shot outcomes — checked FIRST regardless of wrapper, because penalty
  //    goals nest like <Event><Penalty><ShotAtGoal><SuccessfulShot/>…
  //    so a strict first-child match would miss them and undercount goals.
  const successful = findDescendant(ev, 'SuccessfulShot');
  if (successful) {
    const shotAtGoal = findDescendant(ev, 'ShotAtGoal') ?? {};
    const isPenalty = findDescendant(ev, 'Penalty') !== null;
    const cr = String(successful['@_CurrentResult'] ?? '0:0');
    const [h, g] = cr.split(':').map(Number);
    return {
      type: 'goal',
      payload: {
        teamId: shotAtGoal['@_Team'] !== undefined ? String(shotAtGoal['@_Team']) : undefined,
        playerId: shotAtGoal['@_Player'] !== undefined ? String(shotAtGoal['@_Player']) : undefined,
        assistPlayerId: successful['@_Assist'] !== undefined ? String(successful['@_Assist']) : undefined,
        scoreAfter: { home: h, guest: g },
        xG: shotAtGoal['@_xG'] !== undefined ? Number(shotAtGoal['@_xG']) : undefined,
        wasPenalty: isPenalty,
      },
    };
  }
  const wide = findDescendant(ev, 'ShotWide');
  if (wide) {
    const shotAtGoal = findDescendant(ev, 'ShotAtGoal') ?? {};
    return { type: 'shotMissed', payload: { teamId: String(shotAtGoal['@_Team'] ?? ''), playerId: String(shotAtGoal['@_Player'] ?? '') } };
  }
  const saved = findDescendant(ev, 'SavedShot');
  if (saved) {
    const shotAtGoal = findDescendant(ev, 'ShotAtGoal') ?? {};
    return { type: 'shotSaved', payload: { teamId: String(shotAtGoal['@_Team'] ?? ''), playerId: String(shotAtGoal['@_Player'] ?? '') } };
  }
  const blocked = findDescendant(ev, 'BlockedShot');
  if (blocked) {
    const shotAtGoal = findDescendant(ev, 'ShotAtGoal') ?? {};
    return { type: 'shotBlocked', payload: { teamId: String(shotAtGoal['@_Team'] ?? ''), playerId: String(shotAtGoal['@_Player'] ?? '') } };
  }

  // 2. Other types — first-child name is sufficient.
  const childName = firstChildElementName(ev);
  if (!childName) return { type: null, payload: {} };
  const child = ev[childName] as Record<string, unknown>;
  if (!isObj(child)) return { type: null, payload: {} };

  switch (childName) {
    case 'KickOff':
      return {
        type: 'kickOff',
        payload: {
          gameSection: String(child['@_GameSection']),
          teamLeft: String(child['@_TeamLeft']),
          teamRight: String(child['@_TeamRight']),
        },
      };
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
      return {
        type: 'substitution',
        payload: {
          teamId: String(child['@_Team'] ?? ''),
          playerOnId: String(child['@_PlayerIn'] ?? ''),
          playerOffId: String(child['@_PlayerOut'] ?? ''),
        },
      };
    case 'CornerKick':
      return { type: 'corner', payload: { teamId: String(child['@_Team'] ?? '') } };
    case 'Foul':
      return { type: 'foul', payload: { teamId: String(child['@_Team'] ?? '') } };
    case 'Offside':
      return { type: 'offside', payload: { teamId: String(child['@_Team'] ?? '') } };
    case 'Penalty':
      // Penalty AWARDED but not yet taken / missed without ShotAtGoal child.
      // (Penalty-that-scored is handled above by the SuccessfulShot branch.)
      return { type: 'penalty', payload: { teamId: String(child['@_Team'] ?? '') } };
    case 'AdditionalTimeDisplayed':
      return {
        type: 'stoppageTimeAnnounced',
        payload: {
          gameSection: String(child['@_GameSection'] ?? ''),
          minutes: Number(child['@_TimeAdditionTotal'] ?? child['@_AdditionalTime'] ?? 0),
        },
      };
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

function displayMinute(matchMinute: number, phase: MatchPhase): string {
  if (phase === 'halfTime') return 'HT';
  if (phase === 'fullTime') return 'FT';
  const minute = Math.floor(matchMinute);
  if (phase === 'firstHalf' && minute > 45) {
    return `45+${minute - 45}'`;
  }
  if (phase === 'secondHalf' && minute > 90) {
    return `90+${minute - 90}'`;
  }
  return `${minute}'`;
}

function parseEvents(): { events: NormalizedEvent[]; firstKickoffIso: string; secondKickoffIso: string | null } {
  const xml = readFileSync(EVENTS_XML, 'utf-8');
  const doc = parser.parse(xml);
  const all = (doc.PutDataRequest.Event ?? []) as RawEvent[];

  // 1. Find both KickOff anchors.
  let firstKickoffIso: string | null = null;
  let secondKickoffIso: string | null = null;
  for (const ev of all) {
    const child = (firstChildElementName(ev) ?? '') as string;
    if (child !== 'KickOff') continue;
    const ko = ev['KickOff'] as Record<string, string>;
    const section = String(ko['@_GameSection']);
    if (section === 'firstHalf' && !firstKickoffIso) firstKickoffIso = String(ev['@_EventTime']);
    if (section === 'secondHalf' && !secondKickoffIso) secondKickoffIso = String(ev['@_EventTime']);
  }
  if (!firstKickoffIso) throw new Error('No <KickOff GameSection="firstHalf"> event found.');

  const t1 = Date.parse(firstKickoffIso);
  const t2 = secondKickoffIso ? Date.parse(secondKickoffIso) : null;

  // 2. Find FinalWhistle of first half (HT boundary).
  let firstHalfEndIso: string | null = null;
  for (const ev of all) {
    const child = (firstChildElementName(ev) ?? '') as string;
    if (child !== 'FinalWhistle') continue;
    const fw = ev['FinalWhistle'] as Record<string, string>;
    if (String(fw['@_GameSection']) === 'firstHalf') {
      firstHalfEndIso = String(ev['@_EventTime']);
      break;
    }
  }
  const tHt = firstHalfEndIso ? Date.parse(firstHalfEndIso) : Infinity;

  // 3. Classify + assign matchMinute + matchPhase.
  const events: NormalizedEvent[] = [];
  for (const ev of all) {
    const { type, payload } = classify(ev);
    if (type === null) continue; // skip Play/Pass/TacklingGame/etc. — bulk fillers

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
      // Between HT whistle and 2H kickoff
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

    events.push({
      id: String(ev['@_EventId']),
      type,
      matchMinute: Number(matchMinute.toFixed(3)),
      displayMinute: displayMinute(matchMinute, matchPhase),
      matchPhase,
      eventTimeIso: String(ev['@_EventTime']),
      teamId: payload['teamId'] as string | undefined,
      playerId: payload['playerId'] as string | undefined,
      assistPlayerId: payload['assistPlayerId'] as string | undefined,
      cardColor: payload['cardColor'] as NormalizedEvent['cardColor'] | undefined,
      reason: payload['reason'] as string | undefined,
      scoreAfter: payload['scoreAfter'] as NormalizedEvent['scoreAfter'] | undefined,
      // raw payload omitted to keep events.json compact; uncomment for debugging:
      // raw: payload,
    });
  }

  events.sort((a, b) => a.matchMinute - b.matchMinute);
  return { events, firstKickoffIso, secondKickoffIso };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('[parse-match-xml] reading source XMLs...');
  const info = parseMatchInfo();
  const { events, firstKickoffIso, secondKickoffIso } = parseEvents();

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_INFO, JSON.stringify(info, null, 2), 'utf-8');
  writeFileSync(OUT_EVENTS, JSON.stringify({ firstKickoffIso, secondKickoffIso, events }, null, 0), 'utf-8');

  // Summary log — useful for sanity-checking the data each run.
  const byType = new Map<string, number>();
  for (const e of events) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  const summary = Array.from(byType.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `  ${t.padEnd(22)} ${n}`)
    .join('\n');

  console.log(`[parse-match-xml] match-info → ${OUT_INFO}`);
  console.log(`[parse-match-xml] events     → ${OUT_EVENTS}  (${events.length} normalized events)`);
  console.log(`[parse-match-xml] anchors:   1H ${firstKickoffIso}  2H ${secondKickoffIso ?? '(none)'}`);
  console.log(`[parse-match-xml] event breakdown:\n${summary}`);
  console.log(`[parse-match-xml] final score (per XML): ${info.finalResult}`);
}

main();
