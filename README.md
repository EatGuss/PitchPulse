# PitchPulse

Real-time social Bundesliga matchday companion submission for the **DFL × Adidas × Slalom** *Fan Squad* hackathon, Challenge 3 ("A Real-Time Social Match Experience").

Two fans, one matchday. Live event ticker, predict-the-next-moment prompts(shots), PitchPoints, weekly/seasonal standings and collectible titles all reacting to a replayed Bundesliga match in real time.

PitchPulse is mainly focused around shots a prediction game where users are prompted with a prediction(who will score the next goal), the user will answer with one of the options the prompt gives and if they predict correctly they get PitchPoints putting them ahead of their peers who guessed wrong.

1.Watchrooms are designed for online/irl watch parties to give the people a fun little game to play on the side, disscuss shot outcomes and helps new football fans to understand the game.

2.Ranked is design for a fun competitive kick to shots where they face off against other shot-callers in a 1v1. in this 1v1 the shot-callers have access to a ranked specific feature called hot takes which allows the shot-caller to get 2.5x the original amount from the shot only 1 shot-caller can activate this so it adds a bit of strategy. After winning a ranked game the shot-caller gets ranked progress and a match summary, with 5 ranks(Bronze, Silver, Gold, Diamond, Champion) in total with specific number wins to promote to the next. This mode is limited to one game a game week.

---

## TL;DR — run the demo in 3 commands

```bash
npm install
cp .env.example .env.local      # leave VITE_APPSYNC_URL empty for local-only demo
npm run dev
```

Open **`http://127.0.0.1:5173/demo`** (note: `127.0.0.1`, not `localhost`). Two phone frames render side-by-side (Alice + Bob, one shared sim clock). Complete the brief onboarding on **both** frames, then press **▶ Kick off** in the center **MATCH SIM** bar.

From there:

- **Watch Room demo** — Bob: *Compete → Live & Watch Rooms → Create Room*. Alice: *Enter Code → Join*. Bob: *Start Match*. Vote on prompts as they appear.
- **Ranked 1v1 demo** — Both: *Home → Select your match → confirm lock-in*. Press ▶ Kick off, then both: *Compete → Ranked → Play Ranked*. Try the **🔥 Hot Take** toggle (2 per match, 2.5× if correct).

Full step-by-step walkthroughs (including the AWS-backed sim and a troubleshooting table) live in [How to demo this](#how-to-demo-this).

---

## Table of contents

- [The three pillars](#the-three-pillars)
- [App overview](#app-overview)
- [How to demo this](#how-to-demo-this)
- [Data & licensing disclosure](#data--licensing-disclosure)
- [Architecture](#architecture)
- [How to run locally](#how-to-run-locally)
- [How to deploy to AWS](#how-to-deploy-to-aws)
- [Project decisions worth knowing](#project-decisions-worth-knowing)
- [Submission checklist](#submission-checklist)
- [License & repo](#license--repo)

---

## The three pillars

1. **Multiplayer** — two demo users (Alice, Bob) share a matchday session. **Ranked** is head-to-head 1v1 with hidden picks and fixed scoring. **Watch Room** is private invite-code rooms with live picks, reactions, and comments. Passive spectating uses the Home **Live Feed** (no participation, no points).
2. **Real-time data** — a replay emitter reads the anonymized DFL match XML and ticks events out on an accelerated clock (1 match-minute ≈ 2 real seconds). Goal, card, half-time, and secondary events (offside, corner, foul, shots) drive UI changes.
3. **Gamification** — PitchPoints economy, live match leaderboard, weekly/seasonal standings, collectible badges, unlockable titles, and tier progression. Watch Room rewards minority correct picks with `base × min(1 / your_vote_share, 5.0)`. Ranked uses fixed points per correct pick; **Hot Takes** (2 per match) pay **2.5×** when correct. Wrong predictions always earn zero — **never negative, never real money**.

---

## App overview

After onboarding, the app opens on four tabs:

| Tab | What it does |
|---|---|
| **Home** | Matchday hero card, lock-in for ranked fixtures, upcoming/live/FT schedule, active Watch Rooms, Live Feed sheet |
| **Compete** | Toggle **Ranked** vs **Live & Watch Rooms** — matchmaking, invite-code rooms, in-match play |
| **Standings** | Weekly and seasonal leaderboards (local seeds + AWS sync) |
| **Me** | Profile, tier bar, stats, titles grid, match history, settings |

**Ranked flow:** lock a fixture on Home before kickoff → Compete → Play Ranked → matchmaking → live 1v1 match → post-match summary.

**Titles (8 collectible badges)** — thresholds in `src/domain/titleRules.ts` (`npm run verify:titles`):

| Category | Title | Threshold |
|---|---|---|
| Accuracy (lifetime, all ranked) | Sharpshooter | 70%+ accuracy, min 30 shots |
| | Sniper | 80%+ accuracy, min 50 shots |
| | Oracle | 90%+ accuracy, min 100 shots |
| Volume (lifetime ranked matches) | Analyst | 100+ matches |
| | Veteran | 500+ matches |
| Style (single match, kept forever) | Hot Take Hero | Won ≥1 hot take in ranked |
| | Comeback King | Won after trailing 200+ pts at HT |
| | Perfect Match | 100% accuracy in one match, min 6 shots |

**Me → Titles** shows progress on locked cards; equip updates matchmaking reveal. Local `/demo` evaluates on each resolved prompt + full-time; AWS sends match stats with `completeRankedMatch` and `titleUnlocked` subscriptions.

**Watch Room flow:** Compete → Watch Room → create or join by code → lobby → Start Match → shared in-room UX.

---

## How to demo this

This section is a **self-service walkthrough** — follow it top to bottom on a fresh clone. For a timed video shot list with overlay copy, see [`docs/demo-script.md`](./docs/demo-script.md).

### Before you start

| Requirement | Why |
|---|---|
| **Node 22+**, `npm install` | Builds the Vite app |
| **Match replay source** | Deployed stack reads **`s3://hackathon-data-058755927272`** (two XML keys, see [Data & licensing disclosure](#data--licensing-disclosure)); or local parse from a gitignored mirror |
| **`.env.local`** from `.env.example` | Optional for local-only demo; fill AppSync/Cognito only if you want the AWS-backed sim |
| **Route `/demo`** | Two phones (Alice left, Bob right), one shared match clock — **required** for Watch Room and Ranked |

**Local-only demo (recommended first):** leave `VITE_APPSYNC_URL` empty in `.env.local`. The match runs in the browser; both `/demo` frames share in-memory state. No AWS account needed.

**Tighter prompts while exploring:** in `.env.local` set `VITE_PROMPT_WINDOW_MS=5000` and `VITE_SIM_SECONDS_PER_MATCH_MINUTE=2` (full match ≈ 3 real minutes).

**Do not use `/` for the hackathon demo.** That route is one phone only. Ranked 1v1 and Watch Rooms need two personas on `/demo`.

### Quick start (about 5 minutes)

```bash
git clone <repo-url>
cd PitchPulse
npm install
cp .env.example .env.local
# Fill VITE_APPSYNC_* after cdk deploy, OR use gitignored local XML mirror (see "How to run locally")
npm run dev
```

Open **`http://127.0.0.1:5173/demo`** (not `localhost` — Vite is bound to `127.0.0.1`).

1. **Onboarding** — complete the short intro on **both** phone frames (Alice and Bob are fixed; you cannot switch personas on `/demo`).
2. You should land on **Home** on both phones with seeded data: Alice **Silver 4/5**, Bob **Gold 4/8**, sample standings and match history on **Me**.
3. Use the center **MATCH SIM** bar between the phones for **▶ Kick off**, pause, and **⌫ Demo state**.

If **Kick off** does nothing or the feed stays empty, you need either AWS sim configured in `.env.local` or a gitignored local parse — see [How to run locally](#how-to-run-locally).

### Demo A — Watch Room (multiplayer social)

Goal: private room, invite code, live picks, comments, reactions.

| Step | Who | Action |
|:---:|---|---|
| 1 | Both | Stay on **Home** after onboarding |
| 2 | Bob | Bottom nav **Compete** → sub-tab **Live & Watch Rooms** → **Create Room** |
| 3 | Bob | Note the invite code on the lobby card (e.g. `PLZ-482`); tap to copy if needed |
| 4 | Alice | **Compete** → **Live & Watch Rooms** → **Enter Code** → type Bob's code → **Join Room** |
| 5 | Bob | In the lobby, tap **Start Match** |
| 6 | Center bar | **▶ Kick off** — both clocks should tick together; event cards appear on both feeds |
| 7 | Both | When a **prompt** opens, vote within the window. Alice's pick appears on Bob's screen as a live reveal (and vice versa) |
| 8 | Alice | Expand **Comments** on a prompt, send a short line — Bob sees it in the same thread |
| 9 | Alice | Tap a reaction (e.g. 🔥) — animation appears on Bob's phone |
| 10 | Both | Play through to **Full time** — room sidebar shows final PitchPoints standings |

**What you should see:** vote-share % on options (Watch Room only), minority-correct rewards, badge toasts, room leaderboard reordering after resolutions.

### Demo B — Ranked 1v1 (competitive + post-match flow)

Goal: lock-in, hidden picks, Hot Take, outcome screen, optional rank-up, match summary.

**Reset first** if you already played a ranked match: center bar **⌫ Demo state** (restores Alice **Silver 4/5**, Bob **Gold 4/8**, clears lock-in).

| Step | Who | Action |
|:---:|---|---|
| 1 | Both | **Home** → **Select your match** (or hero lock-in) → choose the primary fixture → confirm lock-in |
| 2 | Center | **▶ Kick off** (ranked requires the sim clock running) |
| 3 | Both | **Compete** → sub-tab **Ranked** → **Play Ranked** (or **Home** → **Play Ranked** when offered) |
| 4 | Both | Wait for **matchmaking** → **opponent reveal** (tier + equipped title; Bob shows **Gold**, Alice **Silver**) |
| 5 | Both | Play the live match: picks stay **hidden** until both vote; no vote % shown in ranked |
| 6 | Optional | Tap the **🔥 Hot Take** pill on a prompt **before voting** — the toggle flips to "Hot Take · ON" immediately, rival sees the signal, correct pays **2.5×** (max 2 per match) |
| 7 | Full time | Post-match sequence (ranked only): **Outcome** (Victory / Match Over / Draw) → tap to continue |
| 8 | Alice only (if she wins and promotes) | **Welcome to Gold** full-screen promotion (from Silver 4/5 + 1 win) |
| 9 | Both | **Match Summary** — points breakdown, weekly/seasonal **+Xp from this match**, tier bar, round timeline |
| 10 | Alice | **Me** tab — tier bar now **Gold**, titles grid; **Standings** for weekly board |

**Tip for a promotion run:** vote so Alice ends with more match points than Bob. Bob should see **Match Over** and stay at **Gold 4/8** without a promotion overlay.

**Draw path:** tie match points → **Draw** outcome → summary for both; weekly/seasonal match points still apply; no tier promotion.

### Demo C — AWS-backed sim (optional)

If `.env.local` has `VITE_APPSYNC_URL` and `VITE_COGNITO_IDENTITY_POOL_ID` from `cdk deploy`, restart `npm run dev`. Console should log `[aws-bridge] attached`. **Kick off** then calls `startMatch` in Lambda; both phones subscribe to the same AppSync events. Steps above are the same; only the event source changes.

Deploy steps: [How to deploy to AWS](#how-to-deploy-to-aws).

### Troubleshooting

| Symptom | Fix |
|---|---|
| Blank event feed / parse error | Deploy AWS sim (reads `hackathon-data-058755927272`) or parse from a gitignored local mirror — do not add XML to the repo |
| **Ranked not available** after full time | You are not on `/demo`, or sim was reset mid-match — lock fixture again and replay |
| Only one phone / no opponent | Use **`/demo`**, not `/` |
| Watch Room code rejected | Both must use **⌫ Demo state** or fresh tab; codes are local to this browser session in local-only mode |
| Promotion does not show | **⌫ Demo state**, replay ranked, ensure Alice **wins** on points from **Silver 4/5** |
| `public/events.json` missing in git | **Expected** — generated locally; never committed (hackathon data policy) |

### Repo files you may see locally (safe to ignore)

If you invoke Lambdas manually (`aws lambda invoke … --output json cdk/ranked-out.json`), CDK leaves **response dumps** such as `cdk/ranked-out.json`, `cdk/lb-out.json`, `cdk/stats-out.json`. They are **not** read by the frontend or `npm run dev` and **do not** affect `/demo`. They are gitignored so they never ship in the repo.

### Recording a submission video

- **URL:** `http://127.0.0.1:5173/demo` at **1920×1080**, both frames visible.
- **No voice-over** — on-screen UI + optional text overlays (see demo script).
- **Phone chrome stays on** — do not use `?frame=off` in the recording.
- **Shot list:** [`docs/demo-script.md`](./docs/demo-script.md) (Watch Room ~3 min + ranked appendix).

---

## Data & licensing disclosure

**Hackathon data is not in this repository and must not be uploaded here.** Match replay reads from the official challenge bucket at runtime (or from a **gitignored** local copy on your machine only).

### Source bucket (Challenge 3)

| | |
|---|---|
| **S3 bucket** | `hackathon-data-058755927272` |
| **Objects used** | `Challenge 3 – A Real Time Social Match Experience/data/Match-Events/Events_Anonym.xml` and `.../MatchInformations_Anonym.xml` |

Deployed **`pp-sim-emitter`** loads both keys via `s3:GetObject` (see `HACKATHON_DATA_BUCKET`, `MATCH_EVENTS_KEY`, `MATCH_INFO_KEY` in `.env.example` / CDK). No other prefixes in that bucket are used by PitchPulse.

The match is **`DFL-MAT-000001`** (*FC Team* vs *Club*, 5:0 in the anonymized XML). UI team labels are narrative aliases only (`src/data/teamAliases.ts`). **No crests, kits, logos, or player photos.**

A disclosure line is shown on `/demo`, `/`, and onboarding. Per challenge brief §10, raw XML stays in S3; `.gitignore` blocks `/data/`, `public/events.json`, `public/match-info.json`, and CDK outputs.

---

## Architecture

```
                ┌──────────────────────────────┐
                │  hackathon-data S3 bucket    │
                │  (DFL anonymized match XML)  │
                └──────────────┬───────────────┘
                               │  s3:GetObject  (cold-start cache)
                               ▼
┌──────────────────┐    invoke   ┌─────────────────────┐
│ EventBridge cron │ ──────────▶ │ pp-sim-emitter λ    │
│   rate(1 min)    │             │  2s match-tick loop │
└──────────────────┘             └──────────┬──────────┘
                                            │ write EVENT + CLOCK
                                            ▼
                                  ┌───────────────────────┐
                                  │ DynamoDB pp-matches   │
                                  │ (Streams: NEW+OLD img)│
                                  └──────────┬────────────┘
                                             │ stream record
                                             ▼
                                  ┌──────────────────────┐
                                  │ pp-stream-handler λ  │ ─── SigV4 ──┐
                                  └──────────────────────┘             │
                                                                       ▼
                              ┌──────────────────────────────────────────────┐
                              │ AppSync GraphQL (IAM auth)                   │
                              │   • publishMatchClock / publishMatchEvent    │
                              │   • startMatch / resetMatch                  │
                              │   • submitVote / signalHotTake (vote-handler)│
                              │   • createRoom / joinRoom / postComment      │
                              │     leaveRoom / fireReaction                 │
                              │   • findRankedMatch / lockInRankedMatch      │
                              │     completeRankedMatch / unlockHotTakeHero  │
                              │   • weeklyLeaderboard / seasonalLeaderboard  │
                              │     userStats / rankedMatchdayStatus         │
                              └──────────────────────┬───────────────────────┘
                                                     │  WebSocket subs
                                                     ▼
                                   ┌──────────────────────────────┐
                                   │ React / Vite frontend        │
                                   │  Amplify v6 anonymous guest  │
                                   │  Cognito Identity Pool       │
                                   └──────────────────────────────┘
```

**Tables (DynamoDB, on-demand):**

| Table | PK | SK | Notes |
|---|---|---|---|
| `pp-users` | `USER#<id>` | `PROFILE` / `STREAK` / `BADGE#<id>` / `COIN_LEDGER#<ts>` | Profiles, tiers, titles, leaderboard points |
| `pp-matches` | `MATCH#<id>` | `CLOCK` / `EVENT#<seq>` | Streams `NEW_AND_OLD_IMAGES` |
| `pp-prompts` | `PROMPT#<id>` | `META` / `VOTE#<user>` / `HOT_TAKE_STATE#<user>` | Votes + hot take allowance; TTL on `expiresAt` (24h) |
| `pp-rooms` | `ROOM#<room_id>` | `META` / `MEMBER#<user>` / `REACTION#<ts>` / `COMMENT#<ts>` | `InviteCodeIndex` GSI; TTL on `expiresAt` (24h) |
| `pp-leaderboards` | period key | `USER#<id>` | Weekly / seasonal standings |

**Auth:** Cognito Identity Pool, anonymous guest role. Two pre-created demo IDs (`alice`, `bob`) — no signup, no email, no PII.

**Region:** `eu-central-1` (Frankfurt). Every AWS SDK client, CDK env, and CLI command is pinned to this region.

---

## How to run locally

**Prereqs:** Node 22+, npm 10+, AWS CLI v2, and a valid AWS SSO profile for the hackathon sandbox account `058755927272`.

```bash
git clone <repo>
cd PitchPulse
npm install
```

### 1. Match data (S3 only — not in git)

Use either path:

- **AWS-backed sim (recommended for reviewers):** deploy CDK ([below](#how-to-deploy-to-aws)), fill AppSync/Cognito in `.env.local` — the emitter reads **`hackathon-data-058755927272`** directly.
- **In-browser sim:** optionally mirror the two XML keys from that bucket into gitignored `data/Match-Events/` on your machine, then `npm run parse` — never commit those files or derived JSON.

### 2. Configure environment

```bash
cp .env.example .env.local
# Edit AWS_PROFILE_NAME to match the profile name from your sandbox portal
```

The ISB sandbox portal generates a profile name like `058755927272_slalom_IsbUsersPS`. That exact name goes in `AWS_PROFILE_NAME`. When credentials expire (~1 hour TTL), refresh the credential block in `~/.aws/credentials` from the portal — only that block changes.

For a tight demo recording, also set in `.env.local`:

```bash
VITE_SIM_SECONDS_PER_MATCH_MINUTE=2
VITE_PROMPT_WINDOW_MS=5000
```

### 3. Run

```bash
npm run dev      # runs `npm run parse` first, then starts Vite at 127.0.0.1:5173
```

Then open:

### Which URL to use

| Route | Use for |
|---|---|
| **`http://127.0.0.1:5173/demo`** | **Default for presenting and recording.** Two phone frames (Alice + Bob) side by side, shared match sim, center **MATCH SIM** controls. |
| **`http://127.0.0.1:5173/`** | Dev preview of **one** fan only. **Not** the hackathon demo layout — you cannot run Ranked 1v1 or Watch Room multiplayer on a single frame without opening a second browser/tab. |

**`/demo` ships with pre-populated local seed data** (no DynamoDB setup required in local-only mode): Alice at **Silver 4/5** toward Gold, Bob at **Gold 4/8** toward Diamond, equipped titles, match history on **Me**, and standings seeds. Use **⌫ Demo state** in the center sim bar to reset tiers, matchday lock-in, and rooms without restarting the clock.

The **single-phone** route (`/`) uses the same seeded profile store when you pick Alice or Bob, but only one persona is visible at a time and there is no shared sim bridge between two frames — use it for UI spot-checks (`?as=bob`, `?frame=off`), not for the recorded demo.

After onboarding, both routes land on **Home** with the four-tab nav.

### Run modes (AWS vs local)

The frontend auto-detects whether AWS variables are set in `.env.local`:

| Mode | Trigger | Behaviour |
|---|---|---|
| **Local-only** | `VITE_APPSYNC_URL` empty | MatchSim runs in-browser; both `/demo` phones share in-memory pub/sub. Watch Rooms sync via `localRoomStore`. |
| **AWS** | CDK outputs filled in | Amplify subscribes to AppSync. **▶ Kick off** calls `startMatch`; sim runs in Lambda + DynamoDB Streams. Both phones get the same WebSocket fan-out. |

The challenge brief explicitly allows "a local running app with API calls to AWS" — both modes are valid demo paths.

**Dev reset:** in local dev, **⌫ Demo state** in the sim control bar clears ranked matchday, standings seeds, profile, hot take allowance, and local rooms without restarting the match clock.

---

## How to deploy to AWS

**Prereqs:** all local prereqs, plus CDK bootstrapped once per account/region.

```bash
# Bootstrap once (one-time per account/region):
cd cdk
npx cdk bootstrap aws://058755927272/eu-central-1 \
  --profile <YOUR_ISB_PROFILE>
```

### Deploy the stack

```bash
cd cdk
npm install
npx cdk deploy --require-approval never \
  --profile <YOUR_ISB_PROFILE> \
  --outputs-file cdk-outputs.json
```

Copy outputs into the repo-root `.env.local`:

```bash
VITE_APPSYNC_URL=https://<id>.appsync-api.eu-central-1.amazonaws.com/graphql
VITE_APPSYNC_REGION=eu-central-1
VITE_COGNITO_IDENTITY_POOL_ID=eu-central-1:<uuid>
```

Restart `npm run dev`. A healthy AWS session logs:

```
[amplify] configured for AppSync @ https://...
[amplify] cognito session ready: identityId=... creds=yes
[aws-bridge] attached — matchClock + matchEvent subscriptions live
```

### Faster iteration

```bash
npx cdk deploy --hotswap --profile <YOUR_ISB_PROFILE>
```

Use a full deploy (no `--hotswap`) when changing IAM, GraphQL schema, or CloudFormation-level properties.

### Tearing down

```bash
cd cdk
npx cdk destroy --force --profile <YOUR_ISB_PROFILE>
```

The hackathon S3 bucket is external — the stack only attaches a read-only policy. DynamoDB tables and log groups are removed with the stack (`RemovalPolicy.DESTROY` for the sandbox).

---

## Project decisions worth knowing

| ID | Decision |
|---|---|
| ADR-001 | Prompts fire on the **server-side match clock**, not viewer stream time. 30s answer window enforced server-side. |
| ADR-010 | AppSync (not custom WebSockets) for subscriptions, schema, and auth. |
| ADR-012 | Match data is replayed from the **provided anonymized XML**. No live feeds, no third-party sports APIs. |
| Watch Room reward | `reward = base × min(1 / your_vote_share, 5.0)`. Wrong = 0. |
| Ranked reward | Fixed `baseReward` per correct pick — no odds multiplier in 1v1. |
| Hot Take | 2 per ranked match; correct hot take pays **2.5×**; unlocks **Hot Take Hero** title. |
| Personas | Alice = "Markus" archetype (Casual fan) × FCB. Bob = "Nina" archetype (Moment-led fan) × BVB. Cosmetic only. |
| Anti-licensing | Text-only team labels; no club crests, kits, logos, or player photos. |
| Anti-gambling | "Points" and "odds" framing only. No purchases, sweepstakes, or wager language. |

---

## Submission checklist

Submission is repo-based — reviewers clone or browse this repo directly, no zip handoff. Key files for review:

- [`README.md`](./README.md) — this document; demo walkthrough is at [How to demo this](#how-to-demo-this).
- [`docs/demo-script.md`](./docs/demo-script.md) — shot-by-shot demo script with text-overlay copy.
- [`docs/executive-summary.md`](./docs/executive-summary.md) — source for the executive summary.
- [`docs/jumbotron-concept.png`](./docs/jumbotron-concept.png) — bonus stadium-screen concept.

If the repo is private, invite GitHub user `MoellerO` per the brief.

---

## License & repo

Code in this repository is for the hackathon submission only. Match data lives in **`s3://hackathon-data-058755927272`** only — not uploaded to GitHub. Do not redistribute the hackathon XML.

No licensed Bundesliga marks (crests, kits, player photos) are used anywhere in source or build artifacts. Team labels are text-only; FC Bayern / Borussia Dortmund naming is narrative-only and replaceable via `src/data/teamAliases.ts`.
