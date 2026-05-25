# PitchPulse — 3-minute demo video script (Watch Room cut)

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

### 0:03 — Cold open: onboarding + Home tab (12 sec)

Full `/demo` screen. Complete onboarding on **both** phones (Alice left, Bob right). Both land on **Home**.

**Overlay copy:**
> Two fans · zero signup · pick your mode

### 0:15 — Bob creates a Watch Room (15 sec)

On **Bob's phone**: tap **Watch Room** → **Create Room**. Lobby appears with auto-generated room name and invite code (e.g. `PLZ-482`). Tap the code card to show the copy toast.

**Overlay copy:**
> Private Watch Room · invite code in one tap

### 0:30 — Alice joins (15 sec)

On **Alice's phone**: tap **Watch Room** → **Enter Code** → type Bob's code → **Join Room**. Both phones show the same lobby member list. Bob (host) taps **Start Match**.

**Overlay copy:**
> Friends join by code · host starts the match

### 0:45 — Kick off + real-time sync (20 sec)

Click **▶ Kick off** on the center control bar. Clock ticks on both phones. Within ~10 wall seconds, the same event card lands on both feeds at the same match minute.

**Overlay copy:**
> 1 match-minute ≈ 2 real seconds
>
> XML replay → DynamoDB Streams → AppSync → both phones in <200 ms

### 1:05 — Live picks + vote dance (35 sec)

Wait for the first PromptSheet. Both phones show it simultaneously.

1. **Alice** taps an option → **Bob's phone immediately shows** *"Alice picked …"* (live reveal).
2. **Bob** taps a **different** option → vote-share % rebalance on both screens.
3. Cursor hovers the ⓘ icon briefly (2 sec) to expose "How rewards work".
4. Window expires → **LOCKED** on both phones.
5. Trigger fires → resolution → winning option green → `+N` coin chip on the winner's balance.

**Overlay copy:**
> Live pick reveal — see your friend's choice instantly
>
> Vote within 5s · minority correct picks earn more
>
> Wrong = 0 coins · never negative · never real money

### 1:40 — Comments + reactions (25 sec)

1. On **Alice's phone**, expand **Comments** on the next open prompt. Type a short line (≤ 140 chars) → **Send**. Same comment appears on Bob's thread.
2. On **Alice's phone**, tap 🔥 ⚽ in the reaction bar. Emoji puffs on **both** screens with Alice's avatar.

**Overlay copy:**
> Prompt comment threads · plain text · room-scoped
>
> Reactions broadcast to everyone in the room

### 2:05 — Gamification moment (25 sec)

After a resolution:

1. **Room sidebar** (right edge) reorders by PitchCoin balance — winner moves up.
2. **Badge toast** slides in (e.g. *First Goal Watcher*).
3. Cursor briefly highlights the **streak chip** (🔥 2) if visible.

**Overlay copy:**
> Live room leaderboard · badges unlock automatically

### 2:30 — Full-time + winner (20 sec)

Wait for `90'` / full-time whistle (trim dead air in the editor if needed). Phase chip shows **Full time**. Room sidebar shows final standings.

**Overlay copy:**
> Full-time · final room standings · one shared matchday

### 2:50 — Architecture flash (optional trim-in) (8 sec)

Quick cut to architecture slide from `executive_summary.pdf` slide 3, OR skip if over time.

**Overlay copy:**
> AppSync · Lambda · DynamoDB Streams · Cognito · eu-central-1

### 2:58 — Close card (2 sec)

> **PitchPulse**
> Built for the DFL Fan Squad hackathon · 2026
> github.com/[your-handle]/PitchPulse

End at ≤ 3:00.

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

## Narrative cheat (editor note)
