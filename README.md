# PitchPulse

Real-time social Bundesliga matchday companion — submission for the **DFL × Adidas × Slalom** *Fan Squad* hackathon, Challenge 3 ("A Real-Time Social Match Experience").

Two fans, one matchday. Live event ticker, predict-the-next-moment prompts, PitchPoints, weekly/seasonal standings, collectible titles, and badges — all reacting to a replayed Bundesliga match in real time.

> **Status:** MVP complete through **Gate J** (Hot Take UI). Four-tab app shell, ranked 1v1, Watch Rooms, Standings, and Me profile are shipped on `feature/remove-publicmatch-and-livesheet`. See [PITCHPULSE.md](./PITCHPULSE.md) for the full design spec / ADRs if present.

---

## Table of contents

- [The three pillars](#the-three-pillars)
- [App overview](#app-overview)
- [Data & licensing disclosure](#data--licensing-disclosure)
- [Architecture](#architecture)
- [How to run locally](#how-to-run-locally)
- [How to deploy to AWS](#how-to-deploy-to-aws)
- [How to demo this](#how-to-demo-this)
- [Build status (gates)](#build-status-gates)
- [Project decisions worth knowing](#project-decisions-worth-knowing)
- [What's next (deferred)](#whats-next-deferred)
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

## Data & licensing disclosure

This app replays the **anonymized DFL match XML** provided in the hackathon S3 bucket:

```
s3://hackathon-data-058755927272/Challenge 3 – A Real Time Social Match Experience/
  ├── data/Match-Events/Events_Anonym.xml              (816 KB — event stream)
  ├── data/Match-Events/MatchInformations_Anonym.xml   (12 KB  — lineups + meta)
  └── ...
```

The match is internally identified as **`DFL-MAT-000001`**, with anonymized teams *"FC Team"* (`FCT`) vs *"Club"* (`CLU`), final score **5:0**. Player names in the source are German numeral placeholders (`Spieler Eins` through `Spieler Zwanzig`).

For narrative cohesion we **display these teams as "FC Bayern" (FCB) and "Borussia Dortmund" (BVB)** with subtle team-color accents. **No real-world club crests, kits, logos, or player photos are used anywhere in the app.** Player numbers shown in the UI come straight from the XML; player names rendered are the anonymized placeholders from the source data.

A persistent disclosure line is rendered on `/demo`, `/`, and the onboarding screen so this is visible during any screen recording.

**The hackathon XML is never committed to this repository.** The `.gitignore` blocks `/data/`, `.env.local`, `/cdk.out/`, and CDK output artifacts. Per challenge brief §10, the data stays in the existing `hackathon-data-058755927272` S3 bucket; the deployed `sim-emitter` Lambda reads it via an IAM-scoped `s3:GetObject`.

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

### 1. Download the hackathon data (one-time)

The XML is **not** in the repo. Pull it from the hackathon S3 bucket using your sandbox AWS profile:

```bash
mkdir -p data/Match-Events data/documentation
aws s3 cp "s3://hackathon-data-058755927272/Challenge 3 – A Real Time Social Match Experience/data/Match-Events/Events_Anonym.xml" \
  data/Match-Events/ --profile <YOUR_ISB_PROFILE> --region eu-central-1
aws s3 cp "s3://hackathon-data-058755927272/Challenge 3 – A Real Time Social Match Experience/data/Match-Events/MatchInformations_Anonym.xml" \
  data/Match-Events/ --profile <YOUR_ISB_PROFILE> --region eu-central-1
```

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

## How to demo this

**Always use `/demo`, not `/`.** The two-phone stage is required for Watch Room and Ranked flows (two fans, one shared match clock). Seed data is already loaded in the browser — refresh or **⌫ Demo state** only if you need a clean ranked promotion run (Alice **Silver → Gold** on one win).

Full shot-by-shot script: [`docs/demo-script.md`](./docs/demo-script.md).

### Watch Room cut (~3 min)

1. Open `http://127.0.0.1:5173/demo` at **1920×1080**. Both phone frames visible.
2. Complete onboarding on both phones → **Home**.
3. **Bob** → **Compete** → **Watch Room** → **Create Room** → note invite code (e.g. `PLZ-482`).
4. **Alice** → **Compete** → **Watch Room** → **Enter Code** → joins lobby. Bob taps **Start Match**.
5. Click **▶ Kick off**. Both phones tick together; same event card within ~200 ms.
6. Prompt fires → Alice votes → Bob sees live pick reveal → Bob votes → **Comments** thread on the prompt.
7. Resolution → PitchPoints animation → room sidebar reorders. 🔥 reaction from Alice puffs on Bob's screen.
8. Full-time → final room standings.

### Ranked + Hot Take cut (optional B-roll)

1. **Home** → lock in a live fixture before kickoff.
2. **Compete** → **Ranked** → matchmaking → live 1v1.
3. On a prompt, toggle **Hot Take** → vote. Rival sees the hot take signal; correct hot takes pay **2.5×** and can unlock the **Hot Take Hero** title.
4. Full-time → post-match summary → **Standings** / **Me** tabs for leaderboard and tier progress.

### Recording rules

- **No voice-over.** Text overlays + on-screen labels only.
- **Record at 1920×1080** with **`/demo` open** — not the single-phone `/` route. Both phone frames visible the entire time.
- **Phone-frame chrome stays on** for the recording. `?frame=off` on `/` is for layout testing only.
- **`VITE_PROMPT_WINDOW_MS=5000`** keeps demo cadence tight (~3 prompts in a 3-minute playback). Spec default is `30000`.

---

## Build status (gates)

**Core MVP**

- [x] **Gate 0** — Discover S3 bucket, normalize XML, lock in `.gitignore`
- [x] **Gate 1** — Local foundation: phone-frame UI, dark theme, in-memory pub/sub, `/demo` route
- [x] **Gate 2** — Matchday Shots (live prompts, 30s window, odds-based rewards, ≤ 8 per match)
- [x] **Gate 3** — Watch room reactions, leaderboard, badges, streak chip
- [x] **Gate 4** — AWS deploy: AppSync + Lambda + DynamoDB + EventBridge + Cognito via CDK
- [x] **Gate 5** — Onboarding, tooltip polish, README, demo script, executive summary

**Four-tab restructure + ranked progression**

- [x] **Gate A–D** — App shell, Home tab, matchday lock-in, post-match hero states
- [x] **Gate E** — Compete tab (Ranked vs Live & Watch Rooms), ranked matchday backend
- [x] **Gate F** — Standings tab (weekly / seasonal)
- [x] **Gate G** — Me tab (profile, stats, tier bar, titles, match history)
- [x] **Gate H** — Restructure checkpoint
- [x] **Gate I** — Hot Take backend (`vote-handler`, `signalHotTake`, title unlock)
- [x] **Gate J** — Hot Take UI (toggle, rival indicator, resolution copy)
- [x] **Ranked branch Gate E** — Titles rules, progress copy, unlock toasts, server `completeRankedMatch` stats (see Titles above)
- [ ] **Gate K** / **Ranked branch Gate F** — Demo video, executive PDF, submission zip (in progress — see below)

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

## What's next (deferred)

- **Squad management, packs, trading, wages** — full "Spielmacher" loop from PITCHPULSE.md §6.4–6.6.
- **Cross-device Watch Rooms** — `/demo` syncs two phones in one tab; true multi-browser rooms need shared AWS subscriptions (backend already supports this).
- **Stadium jumbotron mode** — see [`docs/jumbotron-concept.png`](./docs/jumbotron-concept.png).
- **React Native / Expo migration** — phone-frame web app designed for lift-and-shift once design is locked.
- **S3 + CloudFront frontend hosting** — CDK stack has a slot; brief allows local app + AWS API calls.
- **Late-joiner UX** — score bootstraps on refresh but EventFeed does not back-fill; a `recentEvents` query on mount would close this.

---

## Submission checklist

The final hackathon submission zip contains:

```
PitchPulse.zip
├── github_link.txt          # link to this repo
├── presentation_video.mp4   # ≤ 3 min, 1920×1080
├── executive_summary.pdf    # 5 slides (export from docs/executive-summary.md)
└── prfaq.pdf                # optional
```

Files in this repo that feed the submission:

- [`docs/demo-script.md`](./docs/demo-script.md) — shot-by-shot demo script with text-overlay copy.
- [`docs/executive-summary.md`](./docs/executive-summary.md) — source for the 5-slide PDF.
- [`docs/jumbotron-concept.png`](./docs/jumbotron-concept.png) — bonus stadium-screen concept.
- `submission/github_link.txt` — drop the public GitHub URL here once the repo is pushed.

If the repo is private, invite GitHub user `MoellerO` per the brief.

---

## Gate K — submission packaging (in progress)

Code and docs for the final handoff:

| Item | Status |
|---|---|
| `/demo` vs `/` documented + banner on single-phone route | Done |
| [`docs/demo-script.md`](./docs/demo-script.md) — Watch Room cut + ranked B-roll appendix | Done |
| [`docs/executive-summary.md`](./docs/executive-summary.md) — 5-slide PDF source | Done (export PDF locally) |
| [`submission/github_link.txt`](./submission/github_link.txt) | Done |
| `presentation_video.mp4` | **You record** — follow demo script at 1920×1080 |
| `executive_summary.pdf` | **You export** — from executive-summary.md |
| Pre-zip validation | `npm run verify:submission` |

```bash
# After placing video + PDF in submission/:
npm run verify:submission

cd submission
Compress-Archive -Path github_link.txt, presentation_video.mp4, executive_summary.pdf -DestinationPath PitchPulse.zip -Force
```

See [`submission/README.md`](./submission/README.md) for the full checklist.

---

## License & repo

Code in this repository is for the hackathon submission only. The replayed match data is **not** in this repo (see disclosure above). Do not redistribute the hackathon XML.

No licensed Bundesliga marks (crests, kits, player photos) are used anywhere in source or build artifacts. Team labels are text-only; FC Bayern / Borussia Dortmund naming is narrative-only and replaceable via `src/data/teamAliases.ts`.
