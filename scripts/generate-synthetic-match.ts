/**
 * Generates a synthetic match in the same XML shape as the DFL hackathon
 * files (Events_Anonym.xml + MatchInformations_Anonym.xml), so the app can
 * run from a fresh clone without the licensed data.
 *
 * Run with: npm run generate:synthetic
 * Output:   fixtures/synthetic-match/{Events,MatchInformations}_Synthetic.xml
 *
 * Nothing here is derived from the real files. Team IDs and labels reuse the
 * anonymized placeholders the app already hardcodes (DFL-CLU-000001 "FC Team",
 * DFL-CLU-000002 "Club"); players, times and events are invented. The output
 * is deterministic (seeded PRNG) so the committed fixtures can be regenerated
 * byte-for-byte.
 *
 * The scripted moments are placed so every prompt template can open and
 * resolve, and so the 80' prompt is still open at full time (94').
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'fixtures', 'synthetic-match');

const MATCH_ID = 'DFL-MAT-000001';
const HOME = 'DFL-CLU-000001';
const GUEST = 'DFL-CLU-000002';

const KICKOFF_1H = Date.parse('2026-05-16T13:30:00.000Z');
const HALF_TIME_WHISTLE_OFFSET_MIN = 46.5; // 45' + announced 3' stoppage, whistle at 45+1.5
const HALF_TIME_BREAK_MIN = 15;
const KICKOFF_2H = KICKOFF_1H + (HALF_TIME_WHISTLE_OFFSET_MIN + HALF_TIME_BREAK_MIN) * 60_000;

// ─── Deterministic PRNG (mulberry32) ───────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260516);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

// ─── Squads (invented names) ───────────────────────────────────────────────

const SURNAMES = [
  'Albrecht', 'Brandt', 'Castell', 'Dorn', 'Eberle', 'Falk', 'Graf', 'Hollen',
  'Imhof', 'Jessen', 'Kranz', 'Lindqvist', 'Moser', 'Novak', 'Oberle', 'Petrov',
  'Quandt', 'Riedl', 'Sander', 'Thiel', 'Ulrich', 'Voss', 'Wendt', 'Xavier',
  'Yilmaz', 'Zander', 'Adler', 'Bauer', 'Corsi', 'Dietz', 'Engel', 'Fuchs',
] as const;
const POSITIONS = ['TW', 'RV', 'IVR', 'IVL', 'LV', 'DMZ', 'ZM', 'RM', 'LM', 'HST', 'STZ'] as const;

interface Player {
  id: string;
  shirt: number;
  lastName: string;
  first: string;
  starting: boolean;
  position: string;
}

function squad(teamIndex: number): Player[] {
  const out: Player[] = [];
  for (let i = 0; i < 16; i++) {
    const lastName = SURNAMES[teamIndex * 16 + i]!;
    out.push({
      id: `SYN-PLR-${teamIndex + 1}${String(i + 1).padStart(2, '0')}`,
      shirt: i + 1,
      lastName,
      first: String.fromCharCode(65 + ((i * 7 + teamIndex * 3) % 26)),
      starting: i < 11,
      position: i < 11 ? POSITIONS[i]! : 'SUB',
    });
  }
  return out;
}
const SQUADS: Record<string, Player[]> = { [HOME]: squad(0), [GUEST]: squad(1) };
const outfield = (team: string) => SQUADS[team]!.filter((p) => p.starting && p.position !== 'TW');
const player = (team: string, shirt: number) => SQUADS[team]!.find((p) => p.shirt === shirt)!.id;

// ─── Event model ───────────────────────────────────────────────────────────

interface RawEvent {
  t: number; // epoch ms
  xml: string; // inner element(s)
}

const events: RawEvent[] = [];
const at1H = (minute: number) => KICKOFF_1H + minute * 60_000;
const at2H = (matchMinute: number) => KICKOFF_2H + (matchMinute - 45) * 60_000;

function attrs(a: Record<string, string | number | undefined>): string {
  return Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
    .join('');
}
const add = (t: number, xml: string) => events.push({ t, xml });

let score = { home: 0, guest: 0 };
function goal(t: number, team: string, scorer: number, assist?: number, penalty = false): void {
  if (team === HOME) score = { ...score, home: score.home + 1 };
  else score = { ...score, guest: score.guest + 1 };
  const shot =
    `<ShotAtGoal${attrs({ Team: team, Player: player(team, scorer), xG: penalty ? '0.76' : (0.1 + rand() * 0.5).toFixed(2) })}>` +
    `<SuccessfulShot${attrs({ CurrentResult: `${score.home}:${score.guest}`, Assist: assist ? player(team, assist) : undefined })}/>` +
    `</ShotAtGoal>`;
  add(t, penalty ? `<Penalty${attrs({ Team: team })}>${shot}</Penalty>` : shot);
}
function shot(t: number, team: string, outcome: 'ShotWide' | 'SavedShot' | 'BlockedShot'): void {
  const p = pick(outfield(team));
  // Outcome elements need at least one attribute: the parsers only treat
  // element objects as matches, and an attribute-less tag parses to ''.
  const origin = rand() < 0.8 ? 'openPlay' : 'setPiece';
  add(
    t,
    `<ShotAtGoal${attrs({ Team: team, Player: p.id, xG: (rand() * 0.3).toFixed(2) })}>` +
      `<${outcome}${attrs({ ShotOrigin: origin })}/></ShotAtGoal>`,
  );
}
function card(t: number, team: string, shirt: number, reason: string): void {
  add(t, `<Caution${attrs({ Team: team, Player: player(team, shirt), CardColor: 'yellow', Reason: reason })}/>`);
}
function foul(t: number, team: string): void {
  const p = pick(outfield(team));
  add(t, `<Foul${attrs({ TeamFouler: team, Fouler: p.id, FoulType: rand() < 0.1 ? 'handBall' : 'foul' })}/>`);
}
function sub(t: number, team: string, off: number, on: number): void {
  add(t, `<Substitution${attrs({ Team: team, PlayerOut: player(team, off), PlayerIn: player(team, on) })}/>`);
}

// ─── Scripted match: FC Team 3:2 Club ──────────────────────────────────────

add(at1H(0), `<KickOff${attrs({ GameSection: 'firstHalf', TeamLeft: HOME, TeamRight: GUEST })}/>`);
goal(at1H(23.4), HOME, 9, 10); // inside the 20' "home to score in next 10" window → yes
card(at1H(31.2), GUEST, 6, 'foul');
card(at1H(43.8), GUEST, 4, 'foul'); // resolves the 40' "another card before HT" prompt → yes
add(at1H(45), `<AdditionalTimeDisplayed${attrs({ GameSection: 'firstHalf', TimeAdditionTotal: 3 })}/>`);
foul(at1H(45.9), HOME); // 45+ event, compressed into the stoppage slots by the parser
add(at1H(HALF_TIME_WHISTLE_OFFSET_MIN), `<FinalWhistle${attrs({ GameSection: 'firstHalf', FinalResult: '1:0' })}/>`);

sub(KICKOFF_2H - 6 * 60_000, GUEST, 8, 14); // half-time window substitution
add(KICKOFF_2H, `<KickOff${attrs({ GameSection: 'secondHalf', TeamLeft: GUEST, TeamRight: HOME })}/>`);
goal(at2H(52.1), GUEST, 11, 7); // 1:1 — "who scores next" can open on this goal
sub(at2H(60.0), HOME, 7, 13);
goal(at2H(70.6), GUEST, 9); // 1:2 inside the 65' "away to score in next 10" window → yes
goal(at2H(76.3), HOME, 11, 9); // 2:2
sub(at2H(78.0), GUEST, 10, 15);
card(at2H(82.5), HOME, 5, 'tactical');
goal(at2H(87.2), HOME, 9, undefined, true); // 3:2 penalty — 80' "any goal in last 10" → yes
add(at2H(90), `<AdditionalTimeDisplayed${attrs({ GameSection: 'secondHalf', TimeAdditionTotal: 4 })}/>`);
add(at2H(94.0), `<FinalWhistle${attrs({ GameSection: 'secondHalf', FinalResult: '3:2' })}/>`);

// ─── Background play (seeded) ──────────────────────────────────────────────
// Corners, fouls, offsides and non-scoring shots roughly every 2-3 minutes,
// plus unclassified <Play> rows that the parser must skip.

function sprinkle(from: number, to: number, at: (m: number) => number): void {
  for (let m = from + 1 + rand() * 2; m < to - 0.5; m += 1.5 + rand() * 2) {
    const team = rand() < 0.55 ? HOME : GUEST;
    const roll = rand();
    const t = at(m);
    if (roll < 0.3) foul(t, team);
    else if (roll < 0.5) add(t, `<CornerKick${attrs({ Team: team, Side: rand() < 0.5 ? 'left' : 'right' })}/>`);
    else if (roll < 0.6) add(t, `<Offside${attrs({ Team: team, Player: pick(outfield(team)).id })}/>`);
    else if (roll < 0.85) shot(t, team, pick(['ShotWide', 'SavedShot', 'BlockedShot'] as const));
    else add(t, `<Play${attrs({ Team: team, Player: pick(outfield(team)).id })}><Pass/></Play>`);
  }
}
sprinkle(0, 44.5, at1H);
sprinkle(46, 93.5, at2H);

// ─── Serialize ─────────────────────────────────────────────────────────────

events.sort((a, b) => a.t - b.t);
const iso = (t: number) => new Date(t).toISOString().replace('Z', '+00:00');

const eventsXml =
  `<?xml version="1.0" encoding="utf-8"?>\n` +
  `<!-- SYNTHETIC match data generated by scripts/generate-synthetic-match.ts. Not DFL data. -->\n` +
  `<PutDataRequest>\n` +
  events
    .map(
      (e, i) =>
        `  <Event${attrs({ EventId: 900000 + i, EventTime: iso(e.t), MatchId: MATCH_ID })}>${e.xml}</Event>`,
    )
    .join('\n') +
  `\n</PutDataRequest>\n`;

function teamXml(team: string, role: 'home' | 'guest', name: string, short: string, code: string): string {
  const players = SQUADS[team]!
    .map(
      (p) =>
        `        <Player${attrs({
          PersonId: p.id,
          ShirtNumber: p.shirt,
          FirstName: p.first,
          LastName: p.lastName,
          Shortname: `${p.first}. ${p.lastName}`,
          Starting: p.starting ? 'true' : 'false',
          PlayingPosition: p.starting ? p.position : undefined,
        })}/>`,
    )
    .join('\n');
  return (
    `      <Team${attrs({ TeamId: team, Role: role, TeamName: name, ShortName: short, ThreeLetterCode: code })}>\n` +
    `        <Players>\n${players}\n        </Players>\n` +
    `      </Team>`
  );
}

const infoXml =
  `<?xml version="1.0" encoding="utf-8"?>\n` +
  `<!-- SYNTHETIC match data generated by scripts/generate-synthetic-match.ts. Not DFL data. -->\n` +
  `<PutDataRequest>\n` +
  `  <MatchInformation>\n` +
  `    <General${attrs({
    MatchId: MATCH_ID,
    CompetitionName: 'PitchPulse Synthetic League',
    Season: '2025/2026',
    MatchDay: 30,
    PlannedKickoffTime: iso(KICKOFF_1H),
    KickoffTime: iso(KICKOFF_1H),
    Result: '3:2',
    DataSource: 'synthetic',
  })}/>\n` +
  `    <Environment${attrs({ StadiumName: 'Synthetic Arena', StadiumCapacity: 50000, NumberOfSpectators: 48211 })}/>\n` +
  `    <Teams>\n` +
  teamXml(HOME, 'home', 'FC Team', 'Team', 'FCT') +
  `\n` +
  teamXml(GUEST, 'guest', 'Club', 'Club', 'CLU') +
  `\n    </Teams>\n` +
  `    <OtherGameInformation${attrs({
    TotalTimeFirstHalf: Math.round(HALF_TIME_WHISTLE_OFFSET_MIN * 60_000),
    TotalTimeSecondHalf: Math.round(49 * 60_000),
  })}/>\n` +
  `  </MatchInformation>\n` +
  `</PutDataRequest>\n`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'Events_Synthetic.xml'), eventsXml, 'utf-8');
writeFileSync(resolve(OUT_DIR, 'MatchInformations_Synthetic.xml'), infoXml, 'utf-8');
console.log(
  `[generate-synthetic-match] ${events.length} events, final ${score.home}:${score.guest} → ${OUT_DIR}`,
);
