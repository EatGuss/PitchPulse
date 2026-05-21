# PitchPulse — Executive Summary

Source for the 5-slide `executive_summary.pdf` in the submission zip.

**Format:** 5 slides, **16:9, 1920×1080**, dark theme (#0B0F1F bg, white text, Bundesliga-red #E10E1F accents). Export from Keynote / Slides / PowerPoint with PDF "best quality, all fonts embedded".

> **How to use this file:** each `## Slide N` section below is one slide. Bullet points are speaker-note granularity — use the **bold lines** as on-slide copy; the rest is for the deck designer.

---

## Slide 1 — Problem & vision

**On-slide title:** Passive fans → connected fans
**On-slide subtitle:** PitchPulse · Real-time social Bundesliga matchday companion

**The problem (one column):**
- Bundesliga viewers watch alone, even when 50,000 of them are tuned to the same match.
- Group chats are noisy, latent, and disconnected from the action on the pitch.
- The matchday "live moment" is the most valuable real estate in football fandom — and it's currently empty.

**The vision (other column):**
- Two taps to enter a shared watch room. No signup.
- Every goal, card, and half-time whistle triggers something on your phone — a prompt, a ranked board move, a badge unlock.
- Predict the next moment. Outsmart your friends. Earn a coin economy that's pure social currency — no real-money loops, no betting framing, no licensed marks.

**Footer line:** Submission for the DFL × Adidas × Slalom *Fan Squad* hackathon — Challenge 3.

---

## Slide 2 — Solution screenshots

**On-slide title:** What the fan sees

Three phone-frame screenshots side-by-side (390×844 logical, scaled to fit). Captures from `/demo` at 1920×1080, then cropped per phone.

| Screen | Caption (small text under each phone) |
|---|---|
| Matchday view (mid-match) | Live event feed · score chip · profile pill · streak chip |
| Prompt overlay (open + countdown ring) | 5-second answer window · live vote-share % · "How rewards work" tooltip |
| Resolved + leaderboard | `+N` coin animation · winning option highlighted · leaderboard reordered |

**On-slide footnote:**
> Built as a **mobile-first web app** in React + Vite + TypeScript, rendered inside a 390×844 phone frame on the demo desktop. CSS tokens map 1:1 to React Native style objects — the Expo lift-and-shift is a slide-5 next step.

---

## Slide 3 — Architecture

**On-slide title:** Real-time pipeline · eu-central-1 · serverless end-to-end

Visual: the ASCII diagram from the README, rendered as a clean horizontal pipeline graphic with AWS service icons:

```
hackathon-data S3                EventBridge (1-min cron)
       │                                  │
       └────────── reads on cold-start ───┤
                                          ▼
                                ┌──────────────────────┐
                                │ pp-sim-emitter λ     │
                                │ 2-sec match-tick loop│
                                └──────────┬───────────┘
                                           │
                                ┌──────────▼───────────┐
                                │ DynamoDB pp-matches  │
                                │ Streams: NEW+OLD img │
                                └──────────┬───────────┘
                                           │
                                ┌──────────▼───────────┐
                                │ pp-stream-handler λ  │
                                └──────────┬───────────┘
                                           │
   ┌───────────────────────────────────────▼────────────────────────────────┐
   │  AppSync GraphQL (IAM auth, JS resolvers)                              │
   │    publishMatchClock · publishMatchEvent · fireReaction · submitVote   │
   └───────┬──────────────────────────────┬─────────────────────────────────┘
           │ WebSocket subscriptions      │ WebSocket subscriptions
           ▼                              ▼
      Alice's phone                  Bob's phone
      (Amplify v6 · anonymous Cognito guest credentials)
```

**On-slide callouts (3 chips at the bottom of the slide):**

- **AWS services used:** AppSync · Lambda (Node 20) · DynamoDB · DynamoDB Streams · EventBridge · Cognito Identity Pool · IAM · CloudWatch Logs · S3
- **Pinned region:** eu-central-1 (Frankfurt) — no `us-east-1` defaults anywhere
- **No custom WebSocket server. No Kinesis. No API Gateway WS.** AppSync handles fan-out and IAM auth in one box (ADR-010).

---

## Slide 4 — Demo flow (the 4 moments that prove the pillars)

**On-slide title:** Four moments that prove the three pillars

Four numbered panels in a 2×2 grid. Each panel: a small screenshot + a one-line caption.

1. **Kick-off** — both phones light up with the same event card within 200 ms. → **Pillar 2: real-time data**
2. **Prompt vote** — Alice picks A, Bob picks B. Vote-share % bars update on both screens. → **Pillar 1: multiplayer**
3. **Resolution + coin animation** — winning option goes green; `+12c` floats up from the coin balance. Leaderboard reorders. → **Pillar 3: gamification**
4. **Reaction broadcast** — 🔥 from Alice puffs up on Bob's phone with Alice's avatar attached. → **Pillar 1 again: multiplayer**

**Footer line:** Demo video records this exact flow on the `/demo` route at 1920×1080. Total runtime ≤ 3:00.

---

## Slide 5 — What's next

**On-slide title:** Next steps · roadmap

Three columns:

**Cross-platform**
- **React Native (Expo) port** — design tokens already 1:1; engines already DOM-free.
- **Stadium jumbotron mode** — same React app, large-screen layout: live leaderboard between possessions as a between-play tile. See `docs/jumbotron-concept.png`.
- **TV / Apple TV companion app** sharing the same AppSync subscriptions.

**Product**
- **Private watch rooms** — invite-link gated, room-scoped subscriptions. Backend keys already room-scoped (`ROOM#<match_id>`), one filter change away.
- **Spielmacher squad loop** — squad management, packs, trading, wages from PITCHPULSE.md §6.4–6.6. Explicitly Tier 2; deferred per MVP scope.
- **Late-joiner backfill** — `recentEvents` query on mount so refreshing mid-match restores the EventFeed.
- **Push notifications** — SES/SNS to wake fans for marquee fixtures.

**Infra hardening**
- **S3 + CloudFront frontend** — CDK slot already wired; deferred per the brief which explicitly allows local FE + AWS API.
- **Step Functions** for orchestrating multi-event resolution chains.
- **SQS FIFO** in front of the stream-handler for guaranteed ordering at high reaction throughput.
- **WAF + X-Ray + structured CloudWatch dashboards** for production observability.

**Footer line:** All deferred features are mentioned in `README.md` § "What's next (deferred)". Nothing in the MVP code path blocks any of them — they're additive.

---

## Build notes (not in the deck)

- **Deck design:** dark theme (matches the app). Headers in Inter Bold 60–72 pt. Body in Inter Regular 28–32 pt. Bundesliga red `#E10E1F` for the one accent stripe per slide; everything else white / muted grey.
- **No real-world DFL marks:** no club crests, kits, or player photos in the deck. Team labels are text-only ("FC Bayern", "Borussia Dortmund") with 3-letter codes.
- **Export:** PDF, 1920×1080, embed all fonts, "high quality print" preset. Target file size < 5 MB.
