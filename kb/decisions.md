# Decisions

Architectural decisions with rationale and provenance, newest first. Entry format: date, decision, why, source. When a decision is reversed, mark the old entry **Superseded** with a pointer — don't delete it; the rationale trail is the point.

**Hygiene note:** this file is past the KB's ~150-line guideline (`kb/INDEX.md`) — due a split (e.g. by year, or into `decisions.md` + `decisions-archive.md`) in a future `/harness-audit` or dedicated session, not blocking here.

## 2026-07-20 — Signal→channel sync re-binds at channel recreation; effect macros map mix params only

**Decision:** `TrackService.recreateChannel` (#492) ends by calling a private `resyncSignals` — dispose any existing sync effects, re-run `setupChannelSync` against the fresh channel — instead of relying on `createSignals` having wired the sync. Separately, `EffectsChain`'s one-knob macros (Space/Echo/Tone) map the mix parameters only (wet, feedback, cutoff); the character parameters (reverb decay, delay time) are fixed named constants.
**Why:** The undo flow (`useTrackSideEffects` in `projectPageEffects.ts`) recreates signals *before* the channel exists, so `createSignals`' "wire sync only if the channel already exists" guard silently skipped it — every control on an undo-restored track (volume/mute/solo, and the new effect sliders) was dead: UI updated, audio unchanged, no error. Re-binding at recreation is the right altitude because the sync effects run immediately on creation, pushing every current signal value into the fresh channel — which is also what closes the #212 "recreateChannel silently loses a non-persisted param" class for effect amounts ahead of M5's persistence. Found by four independent code-review angles converging; fixed red-then-green. Macros: `Tone.Reverb` regenerates its IR asynchronously on every decay set (silent until `ready`, #489) and delay-time ramps pitch-warp the echoes — neither survives a live slider drag, so the knob maps the mix and the character stays constant. Ear-tuning of the curve constants is deferred to the on-device QA pass (spec 004 open question 2).
**Source:** Issue #492 (spec 004 milestone 4).

## 2026-07-20 — Per-frame ballistics smoothing state resets wherever the idle frame already renders, not on a data-shape check alone

**Decision:** `BarSmoother` (spec 003 milestone 4, #483 — attack/decay smoothing on the playhead meter's semitone bars) gained an explicit `reset()`, wired into `renderLoudnessMeterIdle` rather than only auto-resetting when its target array's length changes.
**Why:** The only reset condition originally implemented — "the incoming array length differs from the stored one" — never actually recurs at runtime: CQT bar count is fixed by `AudioContext.sampleRate` for the component's whole lifetime, so that branch fires once (mount) and never again. Every real discontinuity (pause, stop, seek) instead left the smoother's state untouched, so resuming after a loud passage visibly decayed the stale pre-pause bar heights (~300ms at `DECAY_COEFF=0.15`) instead of reflecting the new position immediately. The fix didn't need a new call site: `renderLoudnessMeterIdle` already fires on every one of those transitions (`useScrubberScroll.ts`'s `!playing` effect and its scroll/seek sync), so resetting there covers all of them for free. General shape: a per-frame stateful smoother's "state looks initialized" check (array length, non-null, etc.) is not the same as "state is still valid for this playback session" — the latter needs an explicit signal tied to the domain's actual discontinuity points. Caught by three independent code-review angles (line-by-line, removed-behavior, altitude) converging on the same bug before it shipped.
**Source:** Issue #483 (spec 003 milestone 4).

## 2026-07-20 — A gesture recognizer's click-suppression ref must not double as another effect's "gesture in progress" gate; a second pointer must not reset an already-locked gesture

**Decision:** `useTrackCycleGesture`'s (#491) `isCyclingRef` — kept true from a completed horizontal cycle gesture until the *next* pointerdown, specifically to suppress the trailing synthetic click — is read directly by `Scrubber.tsx`'s click handler, not folded into `useScrubberScroll`'s `isUserScrubbing()` (which also gates the geometry-resync `useLayoutEffect`). Separately, `useTrackCycleGesture`'s `handlePointerDown` only resets axis/origin/`isCyclingRef` when `pointerCountRef` reaches exactly 1 (a genuinely new gesture), not on every pointerdown.
**Why:** `isUserScrubbing()`'s consumers include a geometry-resync effect that fires on drawer/resize/orientation changes unrelated to any pointer activity — folding in a ref designed to stay true indefinitely after a gesture ends (bounded only by "the next pointerdown", not by time) silently starved that resync for however long the user went before next touching the runway (e.g. swipe to cycle, then open the mixer via a toolbar button — the timeline never resynced to the new drawer height). Separately, resetting axis/origin/`isCyclingRef` unconditionally on every pointerdown meant an incidental second finger (a palm brush that never becomes a real pinch) discarded an already-locked, still-live single-finger gesture — `useScrubberScroll`'s own `handlePointerDown` avoids this by never touching `scrubStateRef` at all, only `pointerDownPosRef`. Both caught by `/code-review` (four independent finder angles converged on the first; one on the second, later independently confirmed), each fixed with a red-then-green regression test.
**Source:** Issue #491 (spec 004 milestone 3).

## 2026-07-20 — `work-issue` commits feature code, review fixes, and the KB update as three separate commits

**Decision:** `work-issue`'s old combined "Ship" step (commit feature code including any review fixes, then commit the KB update separately) is split into three steps — Commit (feature code, before review runs), Review (`/code-review`, its fixes committed separately), Pay back (`/kb write`, committed separately) — landing three distinct commits per PR instead of two.
**Why:** Committing the feature code only at Ship time meant `/code-review` ran against an uncommitted diff and its fixes were silently folded into the same commit as the original implementation — the PR history couldn't show what review actually changed. Committing before review makes the fix commit a visible, separate diff.
**Source:** `.claude/skills/work-issue/SKILL.md`, `.claude/skills/kb/SKILL.md`.

## 2026-07-20 — A React-state-derived signal module's enter/exit lives in one `useEffect`, not scattered across every setter of that state

**Decision:** `editModeSignals`' `activeEditTrackId` (spec 004 milestone 2, #490) is entered/exited from a single `useEffect` in `Workstation.tsx` keyed on `activeSheet`, not from each individual handler that can change `activeSheet` (`toggleMixer`, `toggleLyrics`, `toggleEffects`, `toggleRecording`, the drawer's own close button).
**Why:** an earlier version called `enterEditMode`/`exitEditMode` only from the effects-drawer's own open/close handler. Switching sheets via a *different* toggle (e.g. clicking "Show mixer" while the effects drawer was open) changed `activeSheet` without going through that handler, leaving `activeEditTrackId` stale — `Timeline` kept rendering every track as `--edit-background` with no drawer open and no active track. The same gap meant the signal was never cleared on unmount either (project navigation remounts `Workstation`, resetting its `useState` but not the module-level signal), leaking a stale, now-nonexistent track ID into the next project. A `useEffect(() => { if (open) enter(); return () => exit(); }, [activeSheet])` fixes both: its cleanup fires on every `activeSheet` transition *and* on unmount, so no call site needs to remember to call `exitEditMode()` itself. Caught by three independent code-review angles (removed-behavior, altitude, cross-file tracer) converging on the same bug before it shipped.
**Source:** Issue #490 (spec 004 milestone 2).

## 2026-07-20 — Pinch integration: abort an already-armed scrub via a reducer event, not just gate entry; touchcancel joins touchend

**Decision:** `useScrubberScroll.ts`'s `handlePointerMove` checks `isPinchingRef.current` *before* the `scrubStateRef !== 'idle'`/pointer-count gates, and — if a gesture is already active — dispatches a new `scrubGesture.ts` event (`pinchStarted`, resolves to `idle` from any state) rather than silently returning. This cancels the pending debounced seek and, if the gesture had already paused playback, resumes it. Separately, `useTimelineZoom.ts` now listens for `touchcancel` alongside `touchend`, both resetting `isPinchingRef.current = false`.
**Why:** #474's pointer-count gate (gesture entry requires exactly one active pointer) already covers a pinch whose two touches land together — the only case CDP's `pinchTimeline` e2e helper can simulate, so those tests passed before this issue's wiring even landed. It does *not* cover a pinch starting **mid-drag**: a resting finger already past the movement threshold (paused, resume armed) before a second finger joins. Gating pinch suppression only on the pointer-count/idle checks — the initial, "belt-and-suspenders" version of this fix — left that armed scrub to ride to its debounced seek, seeking against scroll math a mid-gesture zoom had just changed. Confirmed unreachable-in-practice for the simultaneous-start case (traced pointerDownPosRef nulling) but load-bearing for the mid-drag one — both by independent code-review agents in the same session, then verified by a red-then-green unit test (`Scrubber.test.tsx`) that fails without the reorder. The `touchcancel` gap is the same missing-cancel-event class that caused the original stutter loop (mechanism 1, #472) — before this diff `isPinchingRef` had no observable effect if stuck, so it was latent; wiring it into the scrub controller made a stuck-true value actively harmful (permanently blocks single-finger scrubbing), also caught red-then-green.
**Source:** Issue #476 (spec 002 milestone 4).

## 2026-07-20 — `window.__mawimbi` dev-only e2e verification bridge

**Decision:** `AudioService`'s constructor sets `window.__mawimbi = { spectrogramCache }` when `import.meta.env.DEV`; the shape is declared in `src/global.d.ts`. e2e tests read worker-produced state (e.g. transcribed melody notes) directly through it instead of reverse-engineering a DOM/pixel proxy for a data claim.
**Why:** Milestone 1 of spec 003 (#480) needed to prove "a known note exists at a known time" after real Basic Pitch transcription. The candidates were screenshot-decoding the piano-roll overlay's paint (fragile: the overlay draws on the same canvas as the already-colorful spectrogram content, under a 3D tilt transform, so isolating "melody-note pixels" from "spectrogram pixels" would require reimplementing the renderer's coordinate math in the test) or a direct read. `kb/verification.md`'s own hierarchy prefers a direct state read for a data claim — the bridge is that, just reachable through `page.evaluate` instead of a plain getter. Scoped minimally (only `spectrogramCache`, not the whole `AudioService`) and DEV-only, so it never exists on deployed builds — e2e always runs against `npm start` per `playwright.config.ts`, so DEV-gating alone (no `?query` escape hatch, unlike `?tune`) is sufficient.
**Source:** Issue #480 (spec 003 milestone 1).

## 2026-07-20 — PlaybackService command epoch bumps only on real transitions, not guarded no-ops

**Decision:** `PlaybackService.commandEpoch` (issue #475: lets the scrub controller cancel an armed auto-resume if an explicit command intervenes during the debounce window) is bumped inside `play()`/`pause()`/`stop()` only on the branch where a real state transition happens, after their early-return guards — not unconditionally at the top of the method. `rewind()`/`seekTo()` have no such guard and keep bumping unconditionally, since every call to them is a real command regardless of prior state.
**Why:** `play()`/`pause()` are also invoked as incidental cleanup by `RecordingService`/`workstationEffects.ts` (count-in cancellation, overdub start/stop) while playback may already be in the target state. `isActivelyRecording()` is false during count-in ('armed' state) — only true once actually 'recording' — so scrubbing isn't gated off during count-in, making it reachable for a scrub's armed resume to overlap with one of these incidental calls. Bumping the epoch on a guarded no-op there would spuriously cancel a resume that had nothing to do with the intervening call. Caught by three independent code-review angles (removed-behavior, cross-file trace, altitude) converging on the same bug before it shipped, in the same session that introduced the epoch.
**Source:** Issue #475.

## 2026-07-20 — Gesture entry requires exactly one active pointer; end-of-timeline compares raw numbers, never toFixed(1) strings

**Decision:** `useScrubberScroll.ts`'s gesture-entry threshold check (issue #474) only fires with exactly one pointer down; a second pointer joining clears the tracked origin. `PlaybackService.isAtEndOfTimeline()` compares `transportTime >= totalTime` directly, never `toFixed(1)` string equality.
**Why:** A two-finger pinch's `touchmove` handler calling `preventDefault()` suppresses the native *scroll* the browser would otherwise generate, but not the parallel `pointermove` events per finger — each still fires and can cross a movement threshold on its own, so any pointermove-driven gesture check must explicitly gate on pointer count or a pinch misreads as a one-finger drag. Separately, `"10.06".toFixed(1)` → `"10.1"`, never `"10.0"` — a frame that steps over the 0.1s rounding bucket makes string-equality end-of-timeline detection miss the end entirely; the raw numeric `>=` has no such gap. Both found by code review during #474's implementation, before either shipped.
**Source:** Issue #474 (spec 002 milestone 2), PR #498.

## 2026-07-19 — Input-driven gesture model replaces heuristic scroll-source attribution for scrub detection

**Decision:** The scrubber's scrub/gesture detection (spec 002) is a small UI-local state machine (`idle → gestureActive → pendingSeek → idle`) entered **only** from real input events — wheel ticks, `touchmove`/`pointermove` past a movement threshold — never inferred from `scroll` events. `scroll` events only sync visuals and extend the seek debounce while a gesture is active. The two booleans this replaced (`isProgrammaticScrollRef`, the pointer-down override) were deleted, not patched; `PhantomScroller` now handles `pointercancel`/`lostpointercapture` alongside `pointerup`. `PlaybackService` gained a `commandEpoch` counter so explicit transport commands cancel a pending auto-resume armed by a scrub. Two alternatives were rejected: patching the existing flags (add `pointercancel`, add a movement threshold, fix the parity race) and expected-value matching (compare `scroll` events against the value the animation loop last wrote).
**Why:** the flag-patching option converges on the same mechanisms as the state machine anyway, but scattered across five mutable booleans without a by-construction guarantee — the same shape as the losing side of the PhantomScroller decision below, and of #419→#420's heuristic-touch-proxy-loses-to-native-surface pattern. Expected-value matching still infers user intent from `scroll` events and needs epsilon comparisons against clamped/fractional `scrollTop` — the same brittleness class as rect assertions near transforms (`kb/verification.md`). The chosen design uniquely removes the user-vs-loop ambiguity: the animation loop never generates input events, and it's suspended (not writing `scrollTop`) while a gesture is active, so "only the user produces input events during a gesture" holds by construction rather than by bookkeeping. It also fits the state-machine discipline below (unit-testable transitions) instead of adding more heuristics. **Dissent, unresolved:** if real touch momentum has a >200 ms gap between `scroll` events, the seek debounce can fire mid-momentum — the seek commits and playback resumes while leftover momentum events keep arriving; those are correctly ignored for scrub purposes but briefly fight the animation loop's writes visually. No fix shipped speculatively; flagged for the on-device QA checklist (#510) and, if observed, the fix is to extend the gesture window while scroll velocity is nonzero rather than pre-engineering it now.
**Source:** `specs/002-playback-scrub-contract.md` (Design → Council decision record); issues #473 (PR #496), #474 (PR #498), #475 (PR #502), #476 (PR #509).

## 2026-07-19 — Stub Node-only transitive ML dependencies

**Decision:** `package.json` `overrides` maps `onnxruntime-node` and `sharp` to an in-repo empty package.
**Why:** the packages are dead weight (all inference is in-browser), and a *local* stub — rather than a registry "empty package" — keeps third parties out of the supply chain. Sizes, recovery-speed rationale, and the runtime failure-mode gotcha: CLAUDE.md, "Stubbed Node-only dependencies".
**Source:** PR #466.

## 2026-07-19 — Runway is a pure transform stage; PhantomScroller is the only scroll container

**Decision:** No scroll container inside the tilted plane; scroll position is applied as a `translateY` offset stage, and spectrogram canvases are positioned imperatively in the draw rAF loop.
**Why:** Scroll clipping happens in pre-transform layout space, so a scrolling tilted plane clipped everything at/above the playhead before the transform could project it into view — while rect-based tests kept passing. Also removes tilt-side `scrollTop` clamping (#450) by construction.
**Source:** Issue #459, PR #464.

## 2026-07-18 — Solve runway geometry in JS, accept one-frame resize lag

**Decision:** Timeline padding and all runway transforms come from `runwayProjection.solveGeometry()` in JS, replacing pure-CSS `cqh`/custom-property mechanisms.
**Why:** The layout→screen mapping is nonlinear under perspective; CSS `calc()` cannot express the inverse projection, and the linear approximation drifted whenever tilt + open drawer combined. Cost: padding lags one frame behind *continuous* native resize (tracked as #453 — accepted tradeoff, not a regression to revert).
**Source:** Issues #443, #445, #453; PR #452.

## 2026-07-18 — Edge rails instead of fog on the runway

**Decision:** Atmospheric fog gradient removed in favor of glowing rails along the timeline edges, rendered as CSS pseudo-elements so the existing `rotateX` projects them.
**Why:** Fog sat behind the playhead's frequency-bar overlay and read as mud; rails match the Beat Saber-style reference art. Fog is deliberately not coming back (scope note on #446). Fog's *first* life was PR #397, removed in #410 — #454 was already a second attempt.
**Source:** PRs #454 (fog reintroduced), #456 (replaced by rails).

## 2026-07-18 — Dev-only tuning overlay instead of tune-by-PR

**Decision:** Visual tuning of the runway happens through a live slider overlay (dev builds / `?tune`), which serializes the result as a `runwayConfig.ts` snippet.
**Why:** Six consecutive PRs had shipped just to adjust single parameters; a feedback loop measured in seconds replaces one measured in deploys.
**Source:** Issue #447, PR #455.

## 2026-07-18 — Tap-to-seek rejected; seeking is drag-only

**Decision:** Tapping the runway toggles playback; seeking happens only by dragging the flat, untransformed PhantomScroller.
**Why:** Inverse-transform tap seeking (`DOMMatrix.inverse()`) would add screen→plane remapping for a gesture drag already covers. `runwayProjection.screenYToPlane` stays as the general inverse projection, exercised only by round-trip tests — don't delete it as "unused", don't re-propose tap-to-seek.
**Source:** Issue #403 (closed not-planned).

## 2026-03-16 — PhantomScroller: a native scroll surface, not a JS touch proxy

**Decision:** Scrolling is owned by an invisible, untransformed overlay that is a real native scroll container.
**Why:** The 3D tilt shrinks the transformed container's hit-test area to a narrow trapezoid, breaking native touch scrolling. A JS pointer-capture touch proxy (#419) shipped and was replaced one day later: the phantom gets wheel/touch/momentum physics for free and deleted the proxy plus dead-zone wheel forwarding. Precursor of the 2026-07-19 only-scroll-container rule.
**Source:** PRs #419, #420.

## 2026-03-15 — Package-by-feature reorg

**Decision:** `src/` reorganized from package-by-layer (`services/`, `hooks/`, `components/`…) to package-by-feature (207 files moved), layout-only.
**Why:** Understanding one feature required searching several top-level directories; `ls src/features/<x>` now shows everything — navigability for agents as much as humans. Public APIs, signal ownership, and the bridge-hook pattern were deliberately unchanged.
**Source:** PR #415.

## 2026-03-15 — Loudness meter replaces the plasma playhead

**Decision:** The playhead visualization is CQT bins as bars in a bordered 2:1 rect; its width is later derived from the solved runway geometry so its edges sit on the rails (#461).
**Why:** The plasma beam (beat detection, spark particles, tendrils) traded simplicity away and its particle internals were untestable (flagged in #365). Deliberate spectacle→simplicity trade.
**Source:** PRs #417, #418.

## 2026-03-12 — Inverted scroll math, not a CSS mirror flip

**Decision:** Time 0 lives at the *bottom* of the scroll area (`scrollTop = maxScrollTop − time × pps`), with `perspective-origin: center bottom` and `align-items: end` on the timeline grid.
**Why:** The alternative — top-down DOM rendering plus `scaleY(-1)` on the container (#381, eliminating 11 inversion points) — inverts the `rotateX` direction and fought every perspective tuning; #401 reverted it. `align-items: end` fixes the track-placement bug that motivated the flip. Don't reintroduce a mirror flip.
**Source:** PRs #375, #381, #401.

## 2026-03-11 — Runway look from `perspective + rotateX` only; scaleX narrowing rejected

**Decision:** No scale-based narrowing in the runway transform.
**Why:** A `scaleX(0.16)` + 85° tilt build (#395, unmerged) made hit-testing and `getBoundingClientRect` fundamentally unreliable — tests had to be deleted; #397 achieved the look while keeping every test. The same thread documented cross-browser interop problems with `overflow` on perspective containers (CSSWG #8193/#9458): keep overflow on a separate wrapper (foreshadowed the #459 clipping bug).
**Source:** PRs #395, #397.

## 2026-03-09 — Basic Pitch replaces MELODIA for melody extraction

**Decision:** Melody extraction uses Spotify Basic Pitch (TF.js, 22.05 kHz, model self-hosted in `public/basic-pitch-model/`); essentia.js remains only for the classification mel spectrogram.
**Why:** essentia's `PredominantPitchMelodia` is monophonic DSP tuned for vocals — chords collapsed to one note, real-world recordings gave mediocre contours. Basic Pitch is polyphonic and instrument-agnostic, and adds pitch-bend data (a path to MIDI export, #182). The swap stayed contained to `MelodyExtractor` because downstream consumes the stable `MelodyNote[]` types.
**Source:** PRs #306 (MELODIA), #354/#355 (replacement).

## 2026-03-08 — Tailwind 4 + shadcn/ui + Vaul replace Ant Design

**Decision:** UI stack is Tailwind CSS 4 + shadcn/ui (owned source) + Vaul bottom sheets; Sonner replaced the message API, Lucide replaced `@ant-design/icons`.
**Why:** Research compared six libraries on mobile-native criteria. AntD lost on enterprise aesthetic, no snap-point bottom sheet, CSS-in-JS runtime cost, and its v5 static `message` API rendering outside the React tree (dark theme never applied to toasts, #247). Mantine was runner-up; MUI rejected (heaviest). Migration ran incrementally with Tailwind coexisting beside AntD via `@layer` until final removal.
**Source:** Issue #282, PRs #283 (research), #296–#333.

## 2026-03-07 — Essentia.js + Discogs-EffNet classification, after four failed model swaps

**Decision:** Instrument classification is a purpose-built supervised pipeline: essentia WASM mel spectrogram → Discogs-EffNet embeddings → MTG-Jamendo instrument head (~21 MB total vs 205 MB CLAP).
**Why:** The failures: `Xenova/clap-large` was deleted from HuggingFace hosting and 401'd in production (#244); AST/AudioSet returns broad event labels useless on isolated stems (#249); CLAP zero-shot, loudest-segment CLAP, and music-trained CLAP each labeled *every* stem "singing vocals" (#250, #261, #266); filename-keyword classification was built and rejected before merge — recordings have no filename and users don't name files by instrument (#259, #261). Lesson: for a narrow classification task, a small supervised head beat every general-purpose/zero-shot model tried.
**Source:** Issue #176; PRs #244–#269.

## 2026-03-06 — Model downloads proxied through same origin

**Decision:** Model URLs use app-relative `/models/*`, proxied by the Vite dev server in development and a Netlify redirect (`/models/* → essentia.upf.edu/models/:splat`) in production.
**Why:** essentia.upf.edu serves no CORS headers, so direct browser `fetch()` fails. Anyone changing model hosting must preserve the indirection.
**Source:** PR #270; `netlify.toml`.

## 2026-03 — IndexedDB: separate stores; storage failures degrade, never wedge

**Decision:** `ProjectStorageService` uses separate object stores (`projects`, `audioData`, `spectrograms`; later melodies v2, transcriptions v3) so metadata lists load without pulling audio, with `idb` for async/await and upgrade management (design: issue #237).
**Why (rules from shipped bugs):** a cached *rejected* `openDB` promise permanently wedged storage for the session — the promise cache must reset on rejection and handle `blocked` (multi-tab; relevant on every `DB_VERSION` bump) (#342). IndexedDB can be wholly unavailable (private browsing) — reads must try/catch/finally into an empty-state render, never a stuck loading state (#311).
**Source:** Issue #237; PRs #241–#246, #311, #342.

## 2026-03-03 — Services own Tone.js; the relay-hook layer was removed

**Decision:** The current architecture — services encapsulate Tone.js, private signals with plain getters plus a `signals` accessor, bridge hooks, workflows coordinate — was fixed in #200–#208.
**Why:** An earlier design had signal-to-signal relay hooks (`useTransportBridge` etc.) translating service signals into engine commands; it was deleted because reactive chains (signal → effect → service → effect) add indirection when the trigger is already a known workflow. Don't reintroduce relay layers as "decoupling". The Q1 migration introduced signals; these PRs defined their ownership discipline.
**Source:** PRs #200, #202–#208.

## 2026-03-03 — AudioWorklet PCM capture for recording; MediaRecorder rejected

**Decision:** `WorkletRecorder` captures raw PCM in an AudioWorklet; `Tone.Recorder` is only the silent fallback — both stop-recording branches must stay maintained.
**Why:** MediaRecorder-based paths are structurally unfit for overdubbing: no sample-accurate timing, unpredictable silence trimming, encoding delay; a `MediaStreamDestination` mix loses track separation; `Tone.Offline` can't capture a live mic. Low-latency mic constraints require bypassing `Tone.UserMedia.open()` (see kb/domain.md, Audio engine).
**Source:** PR #123 (research), #209, #210, #219.

## 2026-02-23 — CI runs e2e on PRs only; Netlify deploys itself

**Decision:** No deploy job in GitHub Actions; e2e restricted to `pull_request` events.
**Why:** A deploy-to-Netlify job (#115) was removed the next day (#120): Netlify's own build integration deploys master, and PR-only e2e saves CI minutes. The final state is intentional, not forgotten deployment.
**Source:** PRs #115, #120.

## 2026-02-22 — Undo/redo: command history over project mutations only

**Decision:** `useUndoReducer` records reverse actions computed from *pre-mutation* state; workstation UI state is deliberately separate so view toggles can never be "undone"; `AudioSourceRepository` buffers are intentionally never disposed in-session, so undo-delete restores a track without re-decoding.
**Why:** The non-disposal especially reads as a leak to a future reader — it is a cache.
**Source:** PR #110.

## 2026-02-22 — React Compiler removed; `useSignals()` is the reactivity mechanism

**Decision:** `babel-plugin-react-compiler` is not wired into the build (the devDep lingers unwired in `package.json` — removal candidate). Every component/hook that reads signals during render calls `useSignals()` — the reason bridge hooks exist in their current form.
**Why:** The compiler's auto-memoization caches signal reads and breaks `@preact/signals-react` v3 reactivity; the library requires either its Babel transform or explicit `useSignals()`. Enabling the compiler reintroduces the #114 failure class: audio engine responds, UI silently frozen.
**Source:** PRs #103 (enabled), #114 (root-caused and removed).

## 2026-02-22 — Signals-based service layer

**Decision:** Service state lives in `@preact/signals-react` signals with single-owner semantics, bridge hooks translating to React, and services as state machines.
**Why:** Decouples the audio engine's state from React render cycles; gives tests synchronous plain-getter access; makes ownership auditable. Seeded by research issue #100, planned as 8 independently-deployable phases (`MIGRATION.md`, PR #102), executed one PR per phase in a day, then regression-cleaned in #114 (lesson: kb/verification.md). Ownership discipline was finalized later in #200–#208 (see above). Full rules: CLAUDE.md ("Design Principles").
**Source:** `FUTURE_PLANS.md` ("Signal-Synced Architecture"), issue #100, PRs #102–#111, #114.

## 2026-02-18 — Modernization stack: Vite; npm and Netlify kept

**Decision:** CRA → Vite; npm and Netlify retained.
**Why:** A client-side audio app with no SSR needs → Vite over Next.js/Remix; npm for single-repo simplicity; a static SPA gains nothing from leaving Netlify. The forcing blocker for the whole migration was `react-beautiful-dnd` (unmaintained, React 18-incompatible) → replaced with @dnd-kit.
**Source:** PRs #76 (plan), #77 (execution).
