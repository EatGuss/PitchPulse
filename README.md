# PitchPulse

Real-time social Bundesliga matchday companion — submission for the **DFL × Adidas × Slalom** *Fan Squad* hackathon, Challenge 3 ("A Real-Time Social Match Experience").

Two fans, one room. Live event ticker, predict-the-next-moment prompts, a PitchCoin economy, a leaderboard, and badges — all reacting to a replayed Bundesliga match in real time.

> **Status:** MVP complete through Gate 5 (polish & submission). See [PITCHPULSE.md](./PITCHPULSE.md) for the full design spec / ADRs if present.

---

## Table of contents

- [The three pillars](#the-three-pillars)
- [Data & licensing disclosure](#data--licensing-disclosure)
- [Architecture (Gate 4)](#architecture-gate-4)
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

1. **Multiplayer** — two demo users (Alice, Bob) share one watch room. Both see each other's votes, reactions, leaderboard positions, and the same match events at the same moment.
2. **Real-time data** — a replay emitter reads the anonymized DFL match XML and ticks events out on an accelerated clock (1 match-minute ≈ 2 real seconds). Goal, card, **and** half-time events drive UI changes — plus offside, corner, foul, shot-saved/blocked/missed for richness.
3. **Gamification** — PitchCoin economy, live leaderboard, collectible badges, streak chip. Correct predictions earn `base_reward × min(1 / your_vote_share, 5.0)` coins. Wrong predictions cost zero — **never negative, never real money**.

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

A persistent disclosure line is rendered on both `/demo` and `/` pages (and on the onboarding screen) so this is visible during any screen recording.

**The hackathon XML is never committed to this repository.** The `.gitignore` blocks `/data/`, `.env.local`, `/cdk.out/` and the CDK outputs file. Per challenge brief §10, the data stays in the existing `hackathon-data-058755927272` S3 bucket; the deployed `sim-emitter` Lambda reads it via an IAM-scoped `s3:GetObject`.

---

## Architecture (Gate 4)

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
                              │ AppSync GraphQL (IAM auth, JS resolvers)     │
                              │   • publishMatchClock  ── @aws_subscribe ──▶ │
                              │   • publishMatchEvent  ── @aws_subscribe ──▶ │
                              │   • fireReaction        (DDB pp-rooms)       │
                              │   • submitVote          (DDB pp-prompts)     │
                              │   • startMatch          (Lambda)             │
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
| `pp-users` | `USER#<id>` | `PROFILE` / `STREAK` / `BADGE#<id>` / `COIN_LEDGER#<ts>` | No Streams |
| `pp-matches` | `MATCH#<id>` | `CLOCK` / `EVENT#<seq>` | Streams `NEW_AND_OLD_IMAGES` |
| `pp-prompts` | `PROMPT#<id>` | `META` / `VOTE#<user>` / `RESOLUTION` | TTL on `expiresAt` (24h) |
| `pp-rooms` | `ROOM#<match_id>` | `MEMBER#<user>` / `REACTION#<ts>` | TTL on `expiresAt` (24h) |

**Auth:** Cognito Identity Pool, anonymous guest role. Two pre-created demo IDs (`alice`, `bob`) — no signup, no email, no PII.

**Region:** `eu-central-1` (Frankfurt). Every AWS SDK client / CDK env / CLI command is pinned to this region — no `us-east-1` defaults anywhere.

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

### 3. Run

```bash
npm run dev      # runs `npm run parse` first, then starts Vite at 127.0.0.1:5173
```

Then open:

- **`http://127.0.0.1:5173/demo`** — the two-phone side-by-side stage used for the demo recording.
- `http://127.0.0.1:5173/` — single-phone view. You'll see the onboarding screen first; tap **Continue as Alice** (or Bob). Add `?as=bob` to deep-link past onboarding, `?frame=off` for raw mobile preview at 390px.

Hit **▶ Kick off** in the demo stage controls and the whole match plays in ~3 minutes.

### Run modes (AWS vs local)

The frontend auto-detects whether AWS variables are set in `.env.local`:

- **Local-only mode** (no `VITE_APPSYNC_URL`): the React MatchSim runs the timeline in-browser. Both phones share an in-memory pub/sub. No AWS calls.
- **AWS mode** (CDK outputs filled in): the React frontend uses Amplify to subscribe to AppSync. **▶ Kick off** invokes the `startMatch` mutation; the live sim runs in Lambda + DynamoDB Streams. Both phones receive the same WebSocket fan-out.

The challenge brief explicitly allows "a local running app with API calls to AWS" — both modes are valid demo paths.

---

## How to deploy to AWS

**Prereqs:** all the local prereqs, plus CDK bootstrapped once per account/region.

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

`cdk-outputs.json` contains the AppSync URL and Cognito Identity Pool ID. Copy them into the repo-root `.env.local`:

```bash
# .env.local at project root (NOT inside cdk/)
VITE_APPSYNC_URL=https://<id>.appsync-api.eu-central-1.amazonaws.com/graphql
VITE_APPSYNC_REGION=eu-central-1
VITE_COGNITO_IDENTITY_POOL_ID=eu-central-1:<uuid>
```

Restart `npm run dev` and you're connected to AWS. The header in the browser DevTools console will log:

```
[amplify] configured for AppSync @ https://...
[amplify] cognito session ready: identityId=... creds=yes
[aws-bridge] attached — matchClock + matchEvent subscriptions live
```

### Faster iteration

```bash
npx cdk deploy --hotswap --profile <YOUR_ISB_PROFILE>
```

`--hotswap` patches Lambda code in seconds, **skipping CloudFormation**. Use a full deploy (no `--hotswap`) when changing IAM, schema, Lambda concurrency, or any other CFN-level property.

### Tearing down

```bash
cd cdk
npx cdk destroy --force --profile <YOUR_ISB_PROFILE>
```

The hackathon S3 bucket is external — the stack only attaches a read-only policy and does not create/delete it. DynamoDB tables and CloudWatch log groups are removed with the stack (`RemovalPolicy.DESTROY` for the sandbox).

### Frontend hosting (deferred)

S3 + CloudFront frontend hosting is **deferred** per the brief ("a local running app with API calls to AWS" scores fine). The CDK stack is structured to drop in an `aws-s3-deployment` + `cloudfront.Distribution` block; see `cdk/lib/pitchpulse-stack.ts` comments.

---

## How to demo this

Detailed shot-by-shot script in [`docs/demo-script.md`](./docs/demo-script.md). The short version:

1. Open `http://127.0.0.1:5173/demo` at **1920×1080**. Both phone frames must be visible top-to-bottom.
2. Confirm the **Alice — FC Bayern fan** and **Bob — Borussia Dortmund fan** labels are above each phone.
3. Start the screen recording (1920×1080, 30 fps).
4. Click **▶ Kick off** on the middle control bar. The clock starts counting.
5. **Pillar 2 (real-time):** point to the matching event card lighting up on both phones simultaneously.
6. **Pillar 1 (multiplayer):** when a prompt sheet slides up, vote on Alice's frame, then vote differently on Bob's frame. The vote-share % updates live on both.
7. **Pillar 3 (gamification):** wait for the prompt to resolve. The winning voter's coin balance animates a `+N` chip in the top-right. The leaderboard reorders within ~200 ms.
8. **Reactions:** tap a 🔥 on Alice's phone → emoji puff floats up on **both** phones.
9. **Half-time:** wait for the 45' whistle. The phase chip flips to "Half time"; the half-time badge fires for anyone who voted on the HT prompt.
10. Stop recording at ≤ 3:00. Trim, add the on-screen text overlays from the demo-script doc, export `presentation_video.mp4`.

### Locked-in recording rules

- **No voice-over.** The video uses **text overlays + on-screen names only**. The UI carries the narrative through visible labels.
- **Record at 1920×1080** with `/demo` open in the browser. Both phone frames must remain visible the entire time.
- **Phone-frame chrome stays on** for the demo. `?frame=off` is for testing the raw mobile layout — never for the recording.
- **`VITE_PROMPT_WINDOW_MS=5000`** in `.env.local` keeps the demo cadence tight (~3 prompts in a 3-minute match playback). Spec default is `30000`.

---

## Build status (gates)

- [x] **Gate 0** — Discover S3 bucket, normalize XML, lock in `.gitignore`
- [x] **Gate 1** — Local foundation: phone-frame UI, dark theme, in-memory pub/sub, `/demo` route
- [x] **Gate 2** — Matchday Shots (live multiplayer prompts, 30s window, odds-based rewards, ≤ 8 per match)
- [x] **Gate 3** — Watch room reactions, leaderboard, badges, streak chip
- [x] **Gate 4** — AWS deploy: AppSync + Lambda + DynamoDB + EventBridge + Cognito via CDK
- [x] **Gate 5** — Onboarding, tooltip polish, README, demo script, executive summary, jumbotron concept

---

## Project decisions worth knowing

| ID | Decision |
|---|---|
| ADR-001 | Prompts fire on the **server-side match clock**, not viewer stream time. 30s answer window enforced server-side. |
| ADR-010 | AppSync (not custom WebSockets) for subscriptions, schema, and auth. |
| ADR-012 | Match data is replayed from the **provided anonymized XML**. No live feeds, no third-party sports APIs. |
| Reward | `reward = base × min(1 / your_vote_share, 5.0)`. Wrong = 0. Never negative, never real money. |
| Personas | Alice = "Markus" archetype (Casual fan) × FCB. Bob = "Nina" archetype (Moment-led fan) × BVB. Cosmetic only — no gameplay advantage. |
| Anti-licensing | Text-only team labels; no club crests, kits, logos, or player photos in the deployed demo. |
| Anti-gambling | "Coins" and "odds" framing only. No purchases, sweepstakes, or wager language anywhere. |

---

## What's next (deferred)

These are explicitly out-of-scope for the MVP but designed for:

- **Squad management, packs, trading, wages** — the full "Spielmacher" loop from PITCHPULSE.md §6.4–6.6.
- **Private watch rooms** — currently one global room; the schema and DDB key layout support room-scoped subscriptions with a one-line filter change.
- **Stadium jumbotron mode** — see [`docs/jumbotron-concept.png`](./docs/jumbotron-concept.png). PitchPulse leaderboard rendered as a between-possessions tile on the in-stadium screen.
- **React Native / Expo migration** — the phone-frame web app was built to be lift-and-shift to RN once the design is locked. CSS tokens map 1:1 to React Native style objects; no DOM-only APIs in the engines.
- **Step Functions, SQS FIFO, WAF, X-Ray, SES/SNS push** — listed in the brief but not on the MVP critical path.
- **S3 + CloudFront frontend hosting** — the CDK stack has a slot for it; `aws-s3-deployment.BucketDeployment` + `aws-cloudfront.Distribution` plugs in cleanly.
- **Late-joiner UX** — refreshing mid-match bootstraps the score correctly but not the EventFeed back-fill. A `recentEvents` AppSync query on mount would close this.

---

## Submission checklist

The final hackathon submission zip contains:

```
PitchPulse.zip
├── github_link.txt          # link to this repo
├── presentation_video.mp4   # ≤ 3 min, 1920×1080
├── executive_summary.pdf    # 5 slides (export from docs/executive-summary.md)
└── prfaq.pdf                # optional, not in the MVP scope
```

Files in this repo that feed the submission:

- [`docs/demo-script.md`](./docs/demo-script.md) — shot-by-shot demo script with text-overlay copy.
- [`docs/executive-summary.md`](./docs/executive-summary.md) — source for the 5-slide PDF.
- [`docs/jumbotron-concept.png`](./docs/jumbotron-concept.png) — bonus stadium-screen concept.
- `submission/github_link.txt` — drop the public GitHub URL here once the repo is pushed.

If the repo is private, invite GitHub user `MoellerO` per the brief.

---

## License & repo

Code in this repository is for the hackathon submission only. The replayed match data is **not** in this repo (see disclosure above). Do not redistribute the hackathon XML.

No licensed Bundesliga marks (crests, kits, player photos) are used anywhere in source or build artifacts. Team labels are text-only and the spec calls out FC Bayern / Borussia Dortmund purely for narrative — replaceable via a one-line edit in `src/data/teamAliases.ts`.
