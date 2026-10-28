# PitchPulse — Code Review

Audit date: 2026-10-28 · Commit `411c6ee` · Scope: whole repo (frontend `src/`, `scripts/`, `cdk/`).
No code was changed while producing this review.

**How I checked things**
- I read all of `cdk/` (stack, schema, every Lambda, every resolver) and the core of `src/`: the sim, the prompt engine, the hot-take store, the AWS clients, the ranked flow, the profile and matchday stores, and the hooks that tie them together. I skimmed the presentational components only for event wiring.
- `tsc -b` (frontend) and `tsc --noEmit` (cdk) both pass. `npm run verify` and `npm run verify:titles` pass. `npm run verify:half-time` and `npm run parse` fail on a clean clone (see H4). `npm run lint` fails (see L1).
- I wrote a throwaway probe script in my scratchpad, outside the repo, to reproduce H2 and H3 against the real `PromptEngine`. Findings marked **Reproduced** were run. Findings marked **Read-confirmed** follow from reading the code but were not run end to end, because the match XML is not in the repo. Findings marked **Plausible** say what would confirm them.

---

## Phase 1 — What I think this is

A hackathon submission (DFL × Adidas × Slalom "Fan Squad", Challenge 3). It's a mobile-style React app where fans make predictions ("shots") on a replayed Bundesliga match and earn PitchPoints. There are two modes:

- **Watch Room**: private invite-code rooms. Payout is `base × min(1/share, 5)`, plus comments and reactions.
- **Ranked 1v1**: fixed points per correct pick, two 2.5× Hot Takes per match, and tier progression from Bronze to Champion.

The canonical demo is `/demo`: two phone frames (Alice and Bob) **in one browser tab**, sharing one in-memory sim. Please correct me if any of this is wrong.

### Structure

```
src/
  main.tsx → App.tsx (routes: "/" single phone, "/demo" two phones)
  pages/       DemoPage, SinglePhonePage, PhoneEntryFlow, MatchPage, tabs/*
  components/  AppShell (4 tabs) → RankedFlow / WatchRoomFlow → PromptSheet etc.
  hooks/       React adapters over the singletons below (useActivePrompt, useHotTake, …)
  sim/         In-browser "server": MatchSim (clock+events), PromptEngine (prompts,
               votes, payouts), hotTakeStore, local*Store (profile, leaderboard,
               rooms, matchday), titleUnlockEngine — all module singletons on TypedEventBus
  domain/      Pure types + rules (tiers, titleRules, matchday, summaries)
  aws/         Mode switch (isAwsMode = 3 VITE_ env vars present), Amplify config,
               bridge.ts (AppSync subs → MatchSim.inject*), per-feature clients that
               call AppSync and fall back to the local stores on error
scripts/       parse-match-xml.ts (XML → public/*.json; runs as predev/prebuild),
               verify-*.ts (headless sanity checks; the only "tests")
cdk/
  lib/pitchpulse-stack.ts   one stack: 5 DynamoDB tables, 9 Lambdas, AppSync (IAM),
                            Cognito identity pool (anonymous), EventBridge crons
  lambda/                   sim-emitter (+ its own copy of the XML parser), start-match,
                            stream-handler, room-, ranked-, leaderboard-, vote-handler,
                            weekly-/season-reset, shared/
  resolvers/                AppSync JS resolvers (NONE-source pass-throughs + fireReaction)
```

**External dependencies:** the hackathon S3 bucket (XML, never committed), AppSync, DynamoDB (and its Streams), Lambda, Cognito Identity, EventBridge. Frontend packages: React 18, react-router 6, aws-amplify 6.

**The key architectural fact:** scoring, vote windows, hot-take limits and payouts are computed **only in the browser** (`src/sim/promptEngine.ts`). The AWS side replays the match clock and events, and persists whatever the client tells it about results. Even in AWS mode, each browser runs its own `PromptEngine`.

### Path A: AWS match replay, from button to UI (traced end to end)
1. `SimControls` ▶ Kick off calls `awsStartMatch()` (`src/aws/bridge.ts:181`), which resets the local `MatchSim` and calls the `startMatch` mutation.
2. The `start-match` Lambda (`cdk/lambda/start-match/index.ts:233`) overwrites the `CLOCK` row (`isRunning=true`, `lastEmittedSeq=-1`) and async-invokes `sim-emitter`.
3. `sim-emitter` (`cdk/lambda/sim-emitter/index.ts:439`) loads the XML from S3 (cached per container), then loops `tickOnce` every 2 seconds for up to 220 seconds. Each tick reads `CLOCK`, works out the match minute from wall time × `SIM_RATE`, batch-writes the due `EVENT#nnnnnn` rows, and puts the new `CLOCK`.
4. The DynamoDB Stream triggers `stream-handler` (`cdk/lambda/stream-handler/index.ts:199`). For each record it SigV4-signs a `publishMatchClock` or `publishMatchEvent` call to a NONE resolver, and `@aws_subscribe` fans that out.
5. In the browser, `attachAwsBridge()` (`src/aws/bridge.ts:106`, called from `useMatchData`) receives the subscription payloads and calls `MatchSim.injectClock` and `injectEvent`. `MatchSim` emits on its bus, and `PromptEngine.onClock`/`onEvent` plus the React hooks update.

### Path B: a ranked vote, through to tier progression (traced end to end)
1. `PromptSheet` option tap → `MatchPage` → `useHotTake.vote()` (`src/hooks/useHotTake.ts:211`) → `PromptEngine.submitVote(..., {hotTake})` (`src/sim/promptEngine.ts:169`). This claims and consumes a hot take in `hotTakeStore`, then fire-and-forget calls `syncSubmitVote`, which reaches the `vote-handler` Lambda and writes a `VOTE` row to `pp-prompts`.
2. A clock tick after the 30 s wall-clock window locks the prompt (`promptEngine.ts:278`). Then `tryResolve()` runs the template's `resolve()`, computes payouts, and emits `userMatchPointsChanged`.
3. `useMatchPoints` updates `RankedFlow`. When `clock.phase === 'fullTime'`, the settle effect (`src/components/RankedFlow.tsx:93`) picks a winner and calls `commitCompleteRankedMatch` (`src/aws/rankedMatchClient.ts:18`).
4. In local mode this calls `localCompleteRankedMatch` (`src/sim/localProfileStore.ts:329`). In AWS mode it calls the `completeRankedMatch` mutation, which reaches `ranked-handler` (`cdk/lambda/ranked-handler/index.ts:642`). That handler updates tier, points, shots and titles in `pp-users`, writes `pp-leaderboards`, and publishes the `leaderboardUpdated`, `titleUnlocked` and `tierPromoted` subscriptions. The client then **overwrites the server's tier result with the local one** (`rankedMatchClient.ts:69-78`).

---

## Phase 2 — Findings (most severe first)

Effort: **S** < 1 h · **M** ≈ half a day · **L** = multiple days.

### CRITICAL

#### C1. Every ranked match on `/demo` is settled twice. Tier wins and matches-played are double-counted locally and in DynamoDB.
- **Where:** `src/components/RankedFlow.tsx:93-141` (settle effect), `src/sim/localProfileStore.ts:329-396`, `cdk/lambda/ranked-handler/index.ts:642-771`. The only guard is `markRankedMatchdayPlayed` at `:276-301`, and it runs **after** the tier and points writes.
- **Why:** each phone frame mounts its own `RankedFlow`, and the README's ranked demo has both phones press *Play Ranked*. Both settle effects fire at full time. Both compute the same winner and loser from the shared `PromptEngine`, and both call `commitCompleteRankedMatch`. Neither `localCompleteRankedMatch` nor `completeRankedMatch` is idempotent: neither checks `matchId`, neither checks "already settled", and neither uses a conditional write.
- **What breaks:** take the scripted demo, Alice at Silver 4/5 beats Bob. The first call promotes Alice to Gold 0/8 and the second makes her Gold 1/8. Both players get `rankedMatchesPlayed += 2`. In AWS mode the server applies weekly and seasonal points twice, applies shots and accuracy twice, and publishes the leaderboard twice. If Bob's frame settles first, Alice's frame receives `promoted:false` and her promotion overlay never shows. This affects the core progression mechanic on every ranked match.
- **Confidence:** Read-confirmed. I did not run the full 3-minute match because the match data isn't in the repo.
- **Fix direction:** make settlement idempotent per `(matchId, matchday, pair)`, both server-side (a conditional put of a `SETTLED#…` row before any mutation) and locally (a settled-set in the store). **Effort: M.**

### HIGH

#### H1. Any anonymous visitor can write arbitrary ranked results, titles and match control for any user.
- **Where:** `cdk/lib/pitchpulse-stack.ts:548-589` grants the unauthenticated role `completeRankedMatch`, `unlockHotTakeHero`, `equipTitle`, `lockInRankedMatch`, `startMatch` and `resetMatch`. `cdk/schema/schema.graphql:387` labels `completeRankedMatch` as "server-only broadcast", which contradicts the grant. The handlers in `cdk/lambda/ranked-handler/index.ts:110-151` and `room-handler` take `userId`, `winnerId` and the points straight from the arguments.
- **Why:** the identity pool ID is shipped in the JS bundle, so anyone loading the deployed site can get these credentials. `userId` is never bound to the Cognito identity (the stack comment at `:527` says so). All scores are client-computed, so the server has nothing to check them against.
- **What breaks:** a single GraphQL call promotes any user, gives them unbounded seasonal points, or grants any title. `resetMatch` and `startMatch` let any viewer restart or stop the one global match for everyone watching. `postComment` and `fireReaction` accept any `userId` and do no membership check (`room-handler/index.ts:341`), so impersonation within a room is trivial.
- **Note:** for a sandbox demo with two fake personas this may be an accepted risk. If so, say it explicitly in the README rather than having the schema comment claim "server-only".
- **Fix direction:** cheap interim (**S**): drop `completeRankedMatch`, `unlockHotTakeHero`, `resetMatch` and `startMatch` from the unauth role, and gate them behind an operator role. Real fix (**L**): bind identity, and make scoring server-authoritative.

#### H2. A prompt that is still open at full time never resolves, so correct picks earn nothing.
- **Where:** `src/sim/promptEngine.ts:278-283` only locks a prompt when `state.isRunning` is true. `tryResolve` (`:326-327`, `:288`) only runs on locked prompts. `src/sim/matchSim.ts:427-440` publishes full time and then calls `pause()`, which sets `isRunning=false` for good.
- **Why:** with the defaults (30 s window, 2 s per match minute), a prompt opened at minute ≥ ~(FT − 15) is still open when full time arrives. `any-goal-last-10` fires at 80'. The prompt stays `open` forever and is never paid out. Then `RankedFlow` settles the match without it.
- **What breaks:** silent loss of up to 200 points (500 with a Hot Take) in the final prompt, which can flip a ranked result.
- **Confidence:** **Reproduced** with the probe. A prompt was opened at 80' and a `no` vote cast. Full time arrived 20 s later, followed by the pause and 10 more minutes of clock. The prompt state was still `open` and Alice had 0 points, even though `resolve()` would have returned `no`. Whether the real match hits this depends on its full-time minute (it does if FT < ~95'), which I can't check without the XML.
- **Fix direction:** lock any open prompt on the `fullTime` event or `end`, then resolve. **Effort: S.**

#### H3. Changing your pick while Hot Take is armed burns a second Hot Take.
- **Where:** `src/hooks/useHotTake.ts:211-231` (`armed` stays true on re-vote), `src/sim/promptEngine.ts:184-195`, `src/sim/hotTakeStore.ts:56-64` (`claimPromptHotTake` returns `true` when the caller already holds the claim, so `consumeHotTake` runs again).
- **Why:** options stay clickable while the prompt is open (`PromptSheet.tsx`, where `disabled = state !== 'open'`), so re-picking is a normal action. There is a related asymmetry: switching a vote via `submitVote(..., hotTake:false)` releases the claim **without** a refund, whereas `setVoteHotTake` refunds (`promptEngine.ts:247-250`).
- **What breaks:** Hot Takes are capped at 2 per match. One change of mind spends both of them on a single prompt.
- **Confidence:** **Reproduced.** Remaining Hot Takes went 2 → 1 (first hot vote) → 0 (re-pick on the same prompt).
- **Fix direction:** in `submitVote`, consume only when `previousHot !== true`, and refund when a hot vote is replaced by a non-hot one. **Effort: S.**

#### H4. A fresh clone cannot run the app in either mode, and the README says it can.
- **Where:** `package.json:8-10` (`predev`/`prebuild` → `parse`), `scripts/parse-match-xml.ts` (throws `ENOENT` on the gitignored `/data/…xml`), `src/hooks/useMatchData.ts:24,50` (AWS mode **also** fetches `/match-info.json` and `/events.json`, and never attaches the bridge if they're missing). README lines 15-24 ("3 commands… No AWS account needed") and line 294 ("AWS-backed sim (recommended for reviewers)").
- **Why:** `npm run dev` dies in `predev` before Vite starts, so the README's troubleshooting advice ("if Kick off does nothing…") never applies. Filling in the AppSync env vars doesn't help either, because the frontend still needs the parsed JSON.
- **What breaks:** a judge or reviewer following the TL;DR gets a stack trace. `npm run verify:half-time` fails for the same reason.
- **Note:** keeping the data out of git is correct and deliberate (licensing). The bug is the hard failure plus docs that contradict it.
- **Fix direction:** make `parse` exit with a clear message rather than crash. In AWS mode, source team info from the server, or ship a non-licensed stub `match-info.json`. Fix the README TL;DR. **Effort: S–M.**

### MEDIUM

#### M1. `sim-emitter` drops events when DynamoDB returns `UnprocessedItems`.
- **Where:** `cdk/lambda/sim-emitter/index.ts:392-407`.
- **Why:** `BatchWriteItem` can partially succeed under throttling. The result is ignored, and `CLOCK.lastEmittedSeq` still advances past the unwritten rows.
- **What breaks:** those events (a goal, for example) are never streamed or broadcast. Scores still change through `CLOCK`, so the UI shows a score change with no goal card, and goal-triggered and goal-resolved prompts misfire.
- **Fix direction:** retry the unprocessed items with backoff, or only advance `lastEmittedSeq` to the last confirmed seq. **Effort: S.**

#### M2. `sim-emitter`'s unconditional `CLOCK` write can undo a `resetMatch` or `startMatch`.
- **Where:** `cdk/lambda/sim-emitter/index.ts:276` (read) and `:405` (unconditional `PutItem`), with `cdk/lambda/start-match/index.ts:210,233`.
- **Why:** if a reset lands between a tick's `readClock` and its `PutItem`, the tick writes back `isRunning=true` and the old `lastEmittedSeq`.
- **What breaks:** "⌫ Demo state" or a re-kickoff is silently ignored and the old match keeps playing.
- **Confidence:** Plausible. The window is the duration of one tick's DynamoDB calls (tens of ms per 2 s). It isn't reproduced. To confirm, hammer `resetMatch` during a running match and watch `CLOCK`.
- **Fix direction:** write with `ConditionExpression: updatedAt = :readUpdatedAt` (or a version attribute) and skip on conflict. **Effort: S.**

#### M3. Ranked handler reads its own writes with eventually consistent reads, and read-modify-writes the title set.
- **Where:** `cdk/lambda/ranked-handler/index.ts:421-457` (`ADD weeklyPoints`, then a non-consistent `loadProfile`, then the leaderboard row is written from that value), `:503`, and `:530-544`/`:352-371` (`unlockedTitles` is read, merged and fully overwritten).
- **Why:** `GetItem` defaults to eventual consistency. Two writers to `unlockedTitles` (for example `unlockHotTakeHero`, triggered mid-match by `useHotTake`, racing the end-of-match `persistTitleUnlocks`) can lose an update.
- **What breaks:** the leaderboard row shows a stale total until the next match, and a freshly unlocked title can disappear.
- **Fix direction:** `ReturnValues: 'ALL_NEW'` on the `ADD`, and `ADD unlockedTitles :set` (string set) instead of overwriting the list. **Effort: S.**

#### M4. The two XML parsers have already diverged.
- **Where:** `scripts/parse-match-xml.ts` sets `stoppageMinutes` on `stoppageTimeAnnounced` events. `cdk/lambda/sim-emitter/parser.ts` never does, yet uses it at `:289-293` to size the first-half stoppage slots. Several other `classify` branches differ too: payload fields, and `xG`/`wasPenalty` are dropped.
- **Why:** two hand-maintained copies of about 450 lines each, with no shared module and no test comparing their output.
- **What breaks:** the HT minute and `45+N'` display can differ between local and AWS mode. **Uncertain:** it only shows if the announced stoppage exceeds the number of late first-half events in the real XML. To confirm, run both parsers on the XML and diff the output.
- **Fix direction:** have one parser module imported by both. **Effort: M.**

#### M5. AWS mode is multiplayer only within one browser tab. Across devices, each player thinks they won.
- **Where:** no client subscribes to `voteSubmitted` (`schema.graphql:420`, with no subscriber in `src/`). `RankedFlow.tsx:101` reads the opponent's points from the **local** engine. `publishRoomLeaderboard` has no caller and isn't in any IAM policy (`pitchpulse-stack.ts:433`), so `SUB_ROOM_LEADERBOARD` (`src/aws/operations.ts:176`) can never fire. Room `status` is never moved to `ACTIVE` or `ENDED` server-side, so the checks at `room-handler/index.ts:279,347` are dead.
- **What breaks:** two real devices in a ranked match each see the opponent on 0 points. Each then calls `completeRankedMatch` naming itself as winner, which compounds C1 and H1.
- **Note:** this may be a deliberate scope cut, since the README says `/demo` is required. If so, document it and remove the dead plumbing. Otherwise it's an **L** fix (server-side vote aggregation).
- **Effort:** S (document) / L (implement).

#### M6. A vote cast while paused reports success but is dropped, and the AWS copy still goes out.
- **Where:** `src/sim/promptEngine.ts:179` and `:231` (`if (isPaused()) return true;`).
- **Why:** the caller treats `true` as accepted. `useHotTake.vote` then sets `hotTakeOn` and fires `syncSubmitVote`/`syncSignalHotTake` to AWS (`useHotTake.ts:221-227`), while the local engine has recorded nothing.
- **What breaks:** the server records a vote (and decrements a Hot Take) that the scoring engine never saw. The local Hot Take toggle also shows as armed when it isn't.
- **Fix direction:** return `false` (or a distinct "paused" result) and let the UI disable input while paused. **Effort: S.**

#### M7. The only "tests" re-implement the logic they claim to verify, and the riskiest paths have none.
- **Where:** `scripts/verify-payouts.ts:9-31` tests its own copy of the payout formula, not `PromptEngine.computePayouts`. The file says to "mirror it here", so it can't catch drift. There is no coverage of ranked scoring, Hot Takes, settlement, `sim-emitter` tick logic or any Lambda. There is no CI.
- **What breaks:** C1, H2, H3, M1 and M2 all live in untested code.
- **Fix direction:** import the real engine (the probe shows it runs headless under `tsx`). **Effort: M.**

### LOW

#### L1. `npm run lint` is broken.
- **Where:** `package.json:15`. ESLint 9 has no `eslint.config.*` and `--ext` is a removed flag. Source files carry `eslint-disable-line react-hooks/exhaustive-deps`, but `eslint-plugin-react-hooks` isn't installed.
- **Impact:** the hooks rules the code relies on are never checked. **Effort: S.**

#### L2. A ranked result can skip the promotion screen in AWS mode.
- **Where:** `RankedFlow.tsx:103-141` and `:172-179`. The outcome screen renders immediately, but `pendingPromoTier` is only set after the network round-trip.
- **Impact:** a fast tap on "continue" skips the promotion overlay.
- **Confidence:** Plausible. To confirm, throttle the network and tap through. **Effort: S.**

#### L3. The weekly reset cron is off by an hour during summer time (CEST).
- **Where:** `pitchpulse-stack.ts:508-513` (`cron 23:00 UTC SUN`) vs. the Berlin-based week keys in `cdk/lambda/shared/periods.ts:14`.
- **Impact:** between 00:00 and 01:00 Berlin time on a Monday in summer, the new week's leaderboard row is written with last week's total. `nextMondayMidnightBerlinIso` (`periods.ts:37`) also passes an un-normalised day (e.g. 35), so its offset check always falls through to +1 h. **Effort: S.**

#### L4. The server never resets the Hot Take counter between matches, and the client swallows the resulting error.
- **Where:** `cdk/lambda/vote-handler/index.ts:65-82` (`if_not_exists` plus a constant `MATCH_ID`, with the TTL refreshed on every init).
- **Impact:** after the first AWS ranked match, server-side `submitVote` with `hotTake` throws, and `hotTakeClient` only logs a `console.warn`. The vote row is lost server-side. Impact is low today because nothing reads those rows. **Effort: S.**

#### L5. Dead or stale code and docs that contradict the code.
- Unwired resolvers: `cdk/resolvers/submitVote.js`, `publishTriviaCompleted.js`, `publishTriviaQuestionClosed.js`.
- The unused `promptsDS` (`pitchpulse-stack.ts:359`) and the `void promptsTable` at `:616`.
- An API-key auth mode (`:313-321`) that no type allows (every type is `@aws_iam` only), yet the key is still emitted as a stack output.
- The stack header (`:18`) lists data sources that are no longer accurate. `:527` says users are distinguished "via a localStorage userId", which contradicts the deliberate no-localStorage rule (`src/sim/demoPersonaLock.ts:3`).
- `promptEngine.ts:2` calls itself the "server-side authority".
- `stream-handler` re-implements `shared/appsyncPublish.ts`.
- The README links `docs/demo-script.md` and `docs/executive-summary.md`, which don't exist. `submission/README.md` refers to `npm run verify:submission`, which doesn't exist.
- **Effort: S.**

#### L6. Dependency advisories.
- `react-router-dom` 6.x has an open-redirect advisory (moderate). As used here, with static routes and no user-controlled redirects, it isn't exploitable.
- `aws-cdk-lib` bundles a vulnerable `fast-uri` and `brace-expansion`, but they only run at synth time on the developer's machine.
- **Effort: S** (`npm audit fix`).

#### L7. `sim-emitter` can read the whole hackathon bucket.
- **Where:** `pitchpulse-stack.ts:175-180` grants `s3:GetObject` on `hackathon-data-…/*`. This is documented as a workaround for the en-dash in the key. A narrower ASCII prefix such as `Challenge 3*` would still work.
- **Effort: S.**

---

## What this repo does well (please don't refactor these away)

- **Data-licensing hygiene is deliberate and correct.** `/data/` is path-anchored in `.gitignore` and the derived JSON is ignored too. There are no AWS keys anywhere in git history (I grepped `git log -p` for key patterns). There is no localStorage, per the challenge brief.
- **The dual-mode design is clean.** AWS mode feeds the same `MatchSim` bus through `injectClock` and `injectEvent`, so the UI is mode-agnostic. The fallback-to-local in each AWS client is consistent.
- **The replay pipeline has well-reasoned details.** `emittedAt` on every `EVENT` write defeats DynamoDB Streams' suppression of no-op records. `reservedConcurrentExecutions: 1` serialises the emitter against the cron. `stream-handler` deliberately doesn't throw, to avoid replaying a whole batch. Score updates are held back until the goal card arrives so the two appear together (`matchSim.ts:242-255`). All of these are documented in comments explaining *why*.
- **Server-side IAM is least-privilege per GraphQL field.** The stream and ranked Lambdas can only call their own publish mutations.
- **Invite codes are generated well.** They use `crypto.randomBytes`, an unambiguous 32-character alphabet, and no modulo bias (32 divides 256). Uniqueness is checked against the GSI.
- **Prompt windows run on wall-clock time, not match time.** The comment explains why a sped-up match clock would make match-time windows unusable.
- **The client allow-lists reaction emoji** before rendering (`bridge.ts:251`). Comment text is validated server-side (length, no `@`). React escapes all rendered text, and there is no `dangerouslySetInnerHTML`.
- **TypeScript runs in `strict` mode in both packages,** and both typecheck cleanly.
- **Title rules are mirrored, not shared, but currently agree** (unlike the XML parsers, M4), and `verify:titles` checks the thresholds.

---

## Phase 3 notes

- **Test baseline:** there is no test runner. The available checks are `tsc -b`, `cdk tsc --noEmit`, `npm run verify` and `npm run verify:titles`. `verify:half-time` and `lint` are currently broken (H4, L1). I'll run the working ones after each tier. Where a fix allows it, I'll add a headless `tsx` check that exercises the real engine, in the style of my probe.
- **Proposed order:** C1 → H2, H3, H4, then H1 (interim IAM tightening only, unless you want the full fix) → MEDIUM → LOW.
- **Unrelated issues I spot while fixing:** these will be appended here rather than fixed.
