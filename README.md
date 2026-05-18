# PitchPulse

Real-time social Bundesliga matchday companion — a submission for the **DFL × Adidas × Slalom** *Fan Squad* hackathon, Challenge 3 ("A Real-Time Social Match Experience").

Two fans, one room. Live event ticker, predict-the-next-moment prompts, a PitchCoin economy, a leaderboard, and badges — all reacting to a replayed Bundesliga match in real time.

> **Status:** in active build. See [`PITCHPULSE.md`](./PITCHPULSE.md) (if present) for the full design spec and ADRs.

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

A persistent disclosure line is rendered on both the `/demo` and `/` pages so this is visible during any screen recording.

---

## Architecture pillars (the three the brief asks for)

1. **Multiplayer** — two demo users (Alice, Bob) share one watch room. Both see each other's votes, reactions, leaderboard position, and the same match events at the same moment.
2. **Real-time data** — a replay emitter reads the anonymized XML and ticks events out on an accelerated clock (1 match-minute ≈ 2 real seconds). Goal, card, and half-time events drive UI changes.
3. **Gamification** — PitchCoin economy, leaderboard, badges, streaks. Correct predictions earn `base_reward × min(1 / your_vote_share, 5.0)` coins. Wrong predictions cost zero — never negative, never real money.

---

## Quick start (local, no AWS)

Prereqs: **Node 22+** and **npm 10+**. The first `npm run dev` will auto-run the XML parser via the `predev` hook.

```bash
git clone <repo>
cd PitchPulse
npm install

# Bring the hackathon data down locally (requires AWS SSO profile — see below).
# The repo's .gitignore blocks /data/ so you'll never accidentally commit it.
mkdir -p data/Match-Events data/documentation
aws s3 cp "s3://hackathon-data-058755927272/Challenge 3 – A Real Time Social Match Experience/data/Match-Events/Events_Anonym.xml" data/Match-Events/ \
  --profile <YOUR_ISB_PROFILE_NAME> --region eu-central-1
aws s3 cp "s3://hackathon-data-058755927272/Challenge 3 – A Real Time Social Match Experience/data/Match-Events/MatchInformations_Anonym.xml" data/Match-Events/ \
  --profile <YOUR_ISB_PROFILE_NAME> --region eu-central-1

npm run dev      # runs `npm run parse` first, then starts Vite at 127.0.0.1:5173
```

Then open in a browser:
- `http://127.0.0.1:5173/` — single-phone view (defaults to Alice; add `?as=bob` to swap, `?frame=off` for raw mobile preview)
- **`http://127.0.0.1:5173/demo`** — the two-phone side-by-side stage used for the demo recording

Hit **▶ Kick off** in the demo stage controls and the whole match plays in ~3 minutes.

### AWS profile

This repo references an AWS profile by name from `.env.local` (see `.env.example`). The ISB sandbox portal generates profile names like `058755927272_slalom_IsbUsersPS` — that exact name is what you put in `AWS_PROFILE_NAME`. When credentials expire, refresh from the portal and overwrite the `[<profile>]` block in `~/.aws/credentials`. The profile name is the only "config knob"; everything else (region, bucket, account ID) is in `.env.example` too.

---

## Demo recording rules (locked in)

- **No voice-over.** The 3-minute demo video uses **text overlays + on-screen names only**. The UI carries the narrative through visible labels (Alice/Bob, FCB/BVB, profile archetypes, badges as they unlock).
- **Record at 1920×1080** with `/demo` open in the browser. Both phone frames must remain visible the entire time.
- **Phone-frame chrome stays on** for the demo. `?frame=off` is for testing the raw mobile layout only — never for the recording.

---

## Project decisions worth knowing

| ID | Decision |
|---|---|
| ADR-001 | Prompts fire on the **server-side match clock**, not viewer stream time. 30s answer window enforced server-side. |
| ADR-010 | AppSync (not custom WebSockets) for subscriptions, schema, and auth — Gate 4. |
| ADR-012 | Match data is replayed from the **provided anonymized XML**. No live feeds, no third-party sports APIs. |
| (Reward) | `reward = base × min(1 / your_vote_share, 5.0)`. Wrong = 0. Never negative, never real money. |
| (Personas) | Alice = "Markus" archetype (Casual fan) × FCB. Bob = "Nina" archetype (Moment-led fan) × BVB. Cosmetic only — no gameplay advantage. |

---

## Build status (gates)

- [x] **Gate 0** — Discover bucket, normalize XML, lock in `.gitignore`
- [x] **Gate 1** — Local foundation: phone-frame UI, dark theme, in-memory pub/sub, `/demo` route
- [ ] **Gate 2** — Matchday Shots (live multiplayer prompts, 30s window, odds-based rewards)
- [ ] **Gate 3** — Watch room, reactions, leaderboard, badges, streaks
- [ ] **Gate 4** — AWS deploy (AppSync + Lambda + DynamoDB + EventBridge + Cognito + S3/CloudFront via CDK)
- [ ] **Gate 5** — Polish, onboarding screen, demo video, executive summary

---

## License & repo

Code in this repository is for the hackathon submission only. The replayed match data is **not** in this repo (see disclosure above). Do not redistribute the hackathon XML.
