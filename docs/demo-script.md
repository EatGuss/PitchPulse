# PitchPulse — 3-minute demo video script

Hackathon: DFL × Adidas × Slalom *Fan Squad* — Challenge 3.
Recording target: **1920×1080, 30 fps, no voice-over, text-overlay narration only.**

> The video uses on-screen text + visible UI labels exclusively. Every text overlay below should appear bottom-center as a translucent strip, **2–3 seconds, then fade**. Music: optional, low ambient bed (no copyrighted track).

---

## Setup (off-camera, before recording)

1. AWS sandbox credentials refreshed.
   ```powershell
   $env:AWS_PROFILE = '058755927272_slalom_IsbUsersPS'
   $env:AWS_REGION  = 'eu-central-1'
   ```
2. `.env.local` set to demo cadence:
   - `VITE_SIM_SECONDS_PER_MATCH_MINUTE=2`
   - `VITE_PROMPT_WINDOW_MS=5000`
3. Backend smoke-tested OK (`aws lambda get-function-concurrency --function-name pp-sim-emitter` returns `1`).
4. Run dev server: `npm run dev`.
5. Open browser **incognito** at `http://127.0.0.1:5173/demo`. Window at 1920×1080 with browser chrome hidden (F11 / Cmd-Shift-F). Hard refresh.
6. DevTools console open in a second monitor for sanity (not in frame). Expect:
   ```
   [amplify] configured for AppSync @ https://...
   [aws-bridge] attached — matchClock + matchEvent subscriptions live
   ```
7. Both phone frames visible top-to-bottom with the inter-phone control bar showing **▶ Kick off** enabled.

---

## Shot sheet (target total: ≤ 3:00)

### 0:00 — Open card (3 sec)

Static title card before the recording cuts to the browser, OR an overlay strip:

> **PitchPulse — Real-time social Bundesliga matchday companion**
> DFL Fan Squad · Challenge 3

### 0:03 — Establishing shot (5 sec)

Full `/demo` screen. Both phones idle on Onboarding-skipped MatchPage at `0'`, score `0–0`, profile pills visible.

**Overlay copy:**
> Two fans · one watch room · zero signup

### 0:08 — Pillar 2 (Real-time data) (25 sec)

Mouse-cursor click on **▶ Kick off**. The match clock starts ticking from `0'`. Within 8–10 wall seconds, an event lands on both phones at the **same match minute**.

- Cursor underlines the match clock on Alice's phone briefly (no annotation needed — UI shows it).
- When a shot/foul/card card lands in the EventFeed, the same card lands in Bob's feed within ~200 ms.

**Overlay copy (timed across this section):**
> 1 match-minute ≈ 2 real seconds
>
> XML replay → DynamoDB Streams → AppSync → both phones in <200 ms

### 0:33 — Pillar 1 (Multiplayer) — vote dance (40 sec)

Wait for the first PromptSheet to slide up. Both phones show it simultaneously.

1. On **Alice's phone**, tap the **first option**. Vote-share % updates on **both phones**.
2. On **Bob's phone**, tap a **different option**. Vote-share % shifts again — viewers can see the bars rebalance on both screens.
3. Cursor briefly hovers the ⓘ icon to **expose the tooltip** ("How rewards work" expands). Hold 2 sec, dismiss.
4. The 5-second window expires → **LOCKED** state on both phones.
5. The trigger fires (next goal / minute X / HT). Resolution → winning option turns green.
6. The winning voter's coin balance animates a `+N` chip in the top-right corner of their phone.

**Overlay copy (timed):**
> Both fans see the same prompt
>
> Live vote-share updates on both phones
>
> Vote within 5s. Odds reward minority correct picks.
>
> Wrong = 0 coins. Never negative. Never real money.

### 1:13 — Pillar 3 (Gamification) — leaderboard + badge (25 sec)

After a resolution where one user wins:

1. The **Leaderboard strip** under the score chip **reorders**. Winner pops to position 1. The viewer's own row outlines in red.
2. A **badge toast** slides in from the top-right of the appropriate phone (e.g. *First Goal Watcher*, *Card Spotter*).
3. Cursor briefly highlights the **streak chip** (🔥 2) next to the team code if a user has 2+ correct in a row.

**Overlay copy:**
> Live leaderboard · reorders within 200 ms of any coin event
>
> Badges unlock automatically · First Goal Watcher · Card Spotter · Half-time Hero · Perfect Predictor

### 1:38 — Pillar 1 again — reactions (15 sec)

On **Alice's phone**, rapidly tap 🔥 ⚽ 🎉 in the reaction bar. Each emoji **puffs up on both phones** with Alice's avatar attached.

**Overlay copy:**
> Reactions broadcast to the whole watch room
>
> 🔥 ⚽ 😱 🎉

### 1:53 — Half-time moment (15 sec)

Wait for `45'` whistle (or fast-forward by trimming dead air in the editor — the section needs to be in the cut). The phase chip flips to **Half time**.

If a half-time prompt was active when the whistle blew, the *Half-time Hero* badge toast lands.

**Overlay copy:**
> Half-time. Score, phase, and badges update across both phones simultaneously.

### 2:08 — Architecture flash (15 sec)

Cut to a static slide / overlay of the architecture diagram from `executive_summary.pdf` slide 3. Hold 12 sec. Two on-screen callouts:

**Overlay copy (one slide, two callouts):**
> EventBridge → Lambda sim-emitter → DynamoDB Streams → stream-handler Lambda → AppSync → both browsers
>
> Cognito Identity Pool (anonymous) · IAM-auth GraphQL · eu-central-1

### 2:23 — What's next (15 sec)

Hold a slide / overlay listing the deferred features:

**Overlay copy:**
> Next: private rooms · React Native lift-and-shift · Spielmacher squad loop · stadium jumbotron mode

### 2:38 — Close card (10 sec)

End card. Show:

> **PitchPulse**
> Built for the DFL Fan Squad hackathon · 2026
> github.com/[your-handle]/PitchPulse

End at 2:48–3:00.

---

## On-screen text overlay style

- **Font:** Inter or system sans, **white #F5F7FA**, 36–44 px.
- **Background:** semi-transparent **#0B0F1Faa** strip, 60–72 px tall, full-width across the bottom of the frame.
- **Position:** bottom-center, **above** the bottom of the visible phone frames so neither phone is occluded.
- **Animation:** fade in 200 ms, hold per shot duration, fade out 200 ms. No slides, no marquee text.
- **Never** put overlays *on top* of the phone screens. Use the dark surrounding area only.

## Cursor visibility

- Use the OS-level large red cursor highlight (macOS Accessibility → Display → Pointer size 4, Solid red) so taps read on a 1080p export.
- Click effect: native ripple is enough; don't overlay a separate "click circle" graphic.

## What NOT to do

- ❌ No `?frame=off` during the recording. Phone chrome stays on.
- ❌ No voice-over. Text overlays only.
- ❌ No mention of Bundesliga brand marks beyond the explicit "FCB" / "BVB" 3-letter codes already in the UI.
- ❌ No keyboard shortcuts visible in frame.
- ❌ Don't show DevTools, terminal, or `.env.local` in the recording.
- ❌ Don't go past 3:00. Recut if needed.
