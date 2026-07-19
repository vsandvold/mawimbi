# 002 — Playback & scrub interaction contract (and the misfire/stutter fixes)

**Status:** Draft
**Date:** 2026-07-19
**Issues:** (filled by /spec-to-issues)

## Summary

Specifies the playback feature as it exists today — play/pause/rewind controls, timeline tap-to-toggle, scroll-to-seek (paused and during playback), and its interplay with pinch-to-zoom and recording — as an explicit behavior contract, and fixes two confirmed bugs in it: a sustained play/pause stutter loop after touch scrubbing, and timeline taps that pause playback only to restart it immediately. Both bugs were reproduced in this session with frame-level state traces; root causes are identified below with file:line evidence. The fix replaces the scrubber's heuristic scroll-source attribution with an input-driven gesture model.

## Grounding

- KB: `kb/domain.md` — scrub-to-seek contract (#19 → #89–#94): scrubbing pauses playback, seeks debounced ~200 ms, auto-resumes only if playback was active before the scrub; resume must never re-seek (#94, formalized as pending-seek in #107). `Tone.Transport` is the single timeline clock.
- KB: `kb/decisions.md` — 2026-07-18 "Tap-to-seek rejected; seeking is drag-only" (#403): tapping the runway toggles playback. 2026-03-16 + 2026-07-19: PhantomScroller is the only scroll container; native scroll physics (momentum) is the point (#419/#420, #459/#464). 2026-03-03 (#200–#208): services as state machines; workflows over reactive chains.
- KB: `kb/product.md` — mobile is a first-class target; recording follows the GarageBand arm→position→play workflow; count-in masks startup latency (#199).
- CLAUDE.md — `transportTime` is not a clock (#130, #153, #211, #217); bug fixes get a failing test first; e2e touch gestures need CDP (`Input.dispatchTouchEvent`).
- Code: `src/features/playback/PlaybackService.ts`, `src/features/playback/usePlaybackService.ts`, `src/features/workstation/scrubber/{Scrubber,PhantomScroller}.tsx`, `src/features/workstation/scrubber/useScrubberScroll.ts`, `src/shared/hooks/useTimelineZoom.ts`, `src/features/workstation/{Workstation.tsx,FloatingToolbar.tsx,workstationEffects.ts}`, `src/features/workstation/workstationSignals.ts`.
- Tests: `src/features/playback/__tests__/PlaybackService.test.ts` (34 unit tests, state machine), `e2e/scrubber-seek.spec.ts`, `e2e/swipe-playback.spec.ts`, `e2e/recording.spec.ts`.
- Session evidence (2026-07-19): live reproductions and rAF-sampled state traces, quoted in "Bug analysis" below.

## The contract (current intended behavior)

Numbered for traceability; C-numbers are preserved behavior, G-numbers (under Goals) are the changes this spec ships.

- **C1 — Play/pause button.** Toggles `stopped → playing ⇄ paused` via `PlaybackService.togglePlayback()`. Disabled when the timeline is empty or the transport is locked (`RecordingService.isTransportLocked()`: count-in or active recording). (`FloatingToolbar.tsx:31-40`)
- **C2 — Rewind button.** Stops the transport, seeks to 0, resets the scroll position. Same disabled conditions as C1. (`Workstation.tsx:127-132`, `PlaybackService.rewind()`)
- **C3 — Spacebar.** Toggles playback unless the transport is locked. (`workstationEffects.ts:22-35`)
- **C4 — Timeline tap.** A tap (press without meaningful movement) on the timeline toggles play/pause. During count-in or active recording it stops recording instead. Tap never seeks — seeking is drag-only (#403). (`Scrubber.tsx:114-120`)
- **C5 — Scroll-to-seek while paused/stopped.** Wheel or touch drag scrolls the timeline freely (native physics, momentum included); ~200 ms after the last scroll event the transport seeks to the scrolled position. Playback does not auto-resume. (`useScrubberScroll.ts:184-207`; e2e: `scrubber-seek.spec.ts`, `swipe-playback.spec.ts`)
- **C6 — Scroll-to-seek during playback.** Scrubbing pauses playback immediately, seeks debounced, then auto-resumes. Resume never re-seeks beyond the single pending seek (#94/#107).
- **C7 — End of timeline.** Reaching the end stops playback preserving the end position (`stopAtEndOfTimeline`); pressing play while stopped at the end restarts from 0 (`PlaybackService.play():99-102`).
- **C8 — Zoom.** Pinch (touch) and Ctrl/Meta+wheel zoom the timeline, clamped to 50–800 px/s (`workstationSignals.ts`); blocked while recording. Zoom preserves the transport-time anchor (scroll re-derives from `transportTime` at the new `pixelsPerSecond`).
- **C9 — Playback while recording.** Count-in plays available lead-in audio while the timeline stays frozen at the recording position; transport is locked (C1–C3 disabled/blocked); scroll-to-seek is disabled during active recording (`useScrubberScroll.ts:227,258`); the end-of-scroll rewind fallback is suppressed while recording (`useScrubberScroll.ts:150-160`); stopping a recording pauses at the current position (`workstationEffects.ts:233-235`).

## Bug analysis

### Reproduction evidence (2026-07-19, Playwright + CDP touch, dev build)

State sampled every animation frame from the play/pause button title ("Pause" visible = playing). Traces are `{t: ms, title}` transition lists.

**Bug 1 — stutter loop.** Touch-swipe the timeline while paused, then press the play button:

```
Play(click) → Pause@112 → Play@145 → Pause@383 → Play@397 → Pause@652 → Play@695
→ Pause@929 → Play@941 → … (indefinitely, ~250 ms period, playing ~15-40 ms per cycle)
```

Playback flaps forever; the button reads "Play" almost continuously because the playing windows are 1–2 frames long.

**Bug 2 — tap misfire.** Tap the timeline while playing (60 ms and 250 ms holds):

```
tap60:  Pause → Play@287 (paused) → Pause@394 (RESTARTED, stays playing)
tap250: Pause → Play@323 (paused) → Pause@548 (restart, Δ225ms ≈ debounce)
        → Play@562 → Pause@656 (stays playing)
```

Both taps end **playing**. The Δ≈100 ms and Δ≈225 ms restart signatures match the two restart routes below.

**Control.** Button-only play/pause with no prior touch interaction is perfectly stable — the defect lives entirely in the scrubber's pointer/scroll bookkeeping.

### Root causes (all in `useScrubberScroll.ts` + `PhantomScroller.tsx`)

The scrubber infers "user scrub" from `scroll` events using two mutable booleans: `isProgrammaticScrollRef` (set before each animation-loop `scrollTop` write, consumed by the next scroll event) and `isPointerDownRef` (set on pointerdown, cleared on pointerup — and pointer-down **overrides** the programmatic flag, `useScrubberScroll.ts:244-251`). A misclassified scroll event calls `pauseForUserScroll()` → `pause()` + arms `shouldResumeRef`; 200 ms later the debounced `setTransportTimeFromScroll()` seeks and calls `play()` (`useScrubberScroll.ts:184-207`).

1. **Missing `pointercancel` handling (primary cause of Bug 1).** `PhantomScroller` registers only `onPointerDown`/`onPointerUp` (`PhantomScroller.tsx:44-47`). When a native touch scroll begins on the phantom (`touch-action: pan-y`), the browser takes over the gesture and fires `pointercancel` — `pointerup` never arrives, so `isPointerDownRef` sticks `true` forever. From then on, *every* animation-loop `scrollTop` write is reclassified as a user scrub: play → first frame's scroll event → pause + arm resume → 200 ms debounce → seek + `play()` → first frame → pause → … The observed ~250 ms flap period is the 200 ms debounce plus a frame or two. A mouse `pointerup` outside the phantom leaks the same way.
2. **The rAF loop's own writes are misread during a finger-down (primary cause of Bug 2).** During playback the animation loop writes `scrollTop` every frame. A tap holds the pointer down for ~60–250 ms — several frames — and the pointer-down override reclassifies those writes as a user scrub: playback pauses via the scrub path (arming `shouldResumeRef`) *before* the tap's `click` fires. The tap then lands on a **paused** transport and `togglePlayback()` restarts it (restart route a, Δ≈100 ms), and/or the debounced auto-resume fires `play()` (restart route b, Δ≈225 ms). Tap-to-pause during playback is therefore structurally broken, not a race the user got unlucky with.
3. **Auto-resume is invisible to explicit commands.** `shouldResumeRef` and the pending debounced seek are never cancelled by `togglePlayback()`/`play()`/`pause()`/`rewind()` (button, spacebar, tap, lyrics-seek). Any armed resume outlives an explicit pause and overrides it up to 200 ms later.
4. **Boolean-flag parity races (latent, lower frequency).** One flag, asynchronous consumption: (a) a clamped/equal `scrollTop` write sets the flag without generating a scroll event (`setScrollPosition` guards on `scrollTop !== scrollPosition` but the browser clamps fractional/out-of-range writes), leaving a stale `true` that swallows the next genuine user scroll — the wheel handler already carries a workaround for exactly this (`useScrubberScroll.ts:220-231`); (b) a user wheel event interleaving with a same-frame programmatic write flips the parity so the loop's own event reads as the user's; (c) `playing` is captured per-render, so scroll events arriving between a button pause and the next render can still arm auto-resume (`useScrubberScroll.ts:53,202-207`).
5. **Pinch-to-zoom is not integrated with scrub detection.** `useTimelineZoom` maintains `isPinchingRef` but `Scrubber.tsx:83` discards the return value; a two-finger pinch fires pointer/scroll events on the phantom that the scrub logic is free to interpret as a scrub (pause + seek mid-zoom), and pinch pointerdowns feed the stuck-flag problem in (1).

## Goals

1. **G1 — Tap-to-pause sticks.** Tapping the timeline during playback pauses and *stays* paused (≥ 1 s, past all debounce windows). Tapping while paused resumes. (Fixes Bug 2.)
2. **G2 — No stutter loop.** After any sequence of touch scrubs, wheel scrubs, taps, and pinches, pressing the play button yields stable playback: no play/pause transition the user didn't initiate. (Fixes Bug 1.)
3. **G3 — Explicit commands cancel pending scrub state.** Any explicit transport command (button, spacebar, tap toggle, rewind, lyrics seek) cancels an armed auto-resume and pending debounced seek.
4. **G4 — A resting finger never scrubs.** Pointer-down without movement past a small threshold is never classified as a scrub.
5. **G5 — Pinch never scrubs.** Pinch-to-zoom during playback zooms without pausing or seeking; zoom preserves the transport-time anchor (C8).
6. **G6 — The scrub contract is preserved.** C5 and C6 behave exactly as today (pause → debounced seek → resume-only-if-was-playing, resume never re-seeks), including wheel and touch momentum.
7. **G7 — Recording interplay is preserved.** C9 unchanged: scrub disabled during active recording, tap stops recording, count-in freeze intact.

## Non-goals

- **No tap-to-seek.** Settled in #403 (closed not-planned); taps toggle, drags seek. This spec does not reopen it.
- **No change to PlaybackService's state machine.** The `stopped → playing ⇄ paused` machine and its transport integration are correct (34 passing unit tests; clean control trace). The defects are in the scrubber's event interpretation. The only service-level addition is the command-epoch counter (Design), which adds no states.
- **No new scroll containers or transform changes.** The PhantomScroller/offset-stage architecture (#459/#464) is untouched.
- **No behavioral redesign of end-of-timeline handling.** The dual mechanism (C7's `stopAtEndOfTimeline` vs the loop's `scrollTop <= 0` rewind fallback, `useScrubberScroll.ts:150-160`) is odd but out of scope; recorded in Open questions.

## Design

### Council decision record

> **Decision:** Option C — an *input-driven gesture model*, implemented as a small UI-local scrub state machine (`idle → gestureActive → pendingSeek → idle`) owned by the scrubber. Scrub state is entered **only** from real input events — wheel ticks, `touchmove`/`pointermove` past a ~8 px threshold — never inferred from `scroll` events. `scroll` events do two things only: sync visuals (spacer/offset), and *extend* the seek debounce while a gesture is active (this is what keeps touch momentum working — during a gesture the rAF loop is suspended, so every scroll event in that window is unambiguously the user's). `isProgrammaticScrollRef` and the pointer-down override are deleted, not patched. `PhantomScroller` handles `pointercancel`/`lostpointercapture` alongside `pointerup`. Explicit transport commands cancel pending scrub state via a **command epoch**: `PlaybackService` increments a counter on every explicit `play`/`pause`/`stop`/`togglePlayback`/`rewind`/`seekTo`; the scrub controller snapshots the epoch when arming auto-resume and, when the debounce fires, resumes only if the epoch is unchanged. Pinch integration: `Scrubber` wires `useTimelineZoom`'s `isPinchingRef` into the controller; an active pinch suppresses gesture entry.
>
> **Rationale:** The Adversary showed Option A (patch the flags: add pointercancel, add a movement threshold, fix parity) converges on C's mechanisms anyway, but scattered across five booleans and without C's by-construction guarantee — the same shape as the losing side of the #459 decision, where patched clamping lost to "make the ambiguity impossible by construction" (and #419→#420, where a heuristic touch proxy lost to a native surface). Option B's expected-value matching (compare scroll events against the value the loop last wrote) still infers intent from `scroll` events and needs epsilon comparisons against clamped/fractional `scrollTop` — the same brittleness class as rect assertions near transforms (`kb/verification.md`). C uniquely eliminates the user-vs-loop ambiguity: the loop never generates input events, and while a gesture is active the loop isn't writing. The state machine form satisfies the Architect (matches the services-as-state-machines discipline, unit-testable transitions) without B's matching heuristics. The scrollbar is hidden (`scrollbar-width: none`), so there is no scrollbar-drag path that would bypass input events. Verification prefers C: gesture inputs → transitions are unit-testable, and the e2e falsifiers (below) already exist as failing reproductions.
>
> **Dissent:** *Simplicity* held that A is fewer lines and that a named state machine may be ceremony for three states — accepted cost, because A leaves the latent parity class (#4 above) alive. *Adversary* records one residual risk in C: if touch momentum has a >200 ms gap between scroll events, the debounce fires mid-momentum — the seek commits and playback resumes while leftover momentum scrolls arrive; those are then correctly *ignored* for scrub purposes (no input events), but they briefly fight the rAF loop's writes visually. Mitigation if observed: extend the gesture window while scroll velocity is nonzero. Watch for it in the momentum e2e rather than pre-engineering. *Adversary* also flags the command epoch as shared mutable state between service and controller; contained by making it a monotonic counter with a single writer (the service), read-only to the controller.

### Sketch

- `useScrubberScroll` keeps its public shape (`handlePointerDown/Up/Cancel`, `handleWheel`, `handleScroll`, plus new `handlePointerMove`/`handleTouchMove` or threshold logic inside pointer handlers; `isUserScrubbing`, `syncScrollToTime`). Internally the refs collapse into one `scrubState` ref driven by the gesture machine. The geometry-resync guard (`Scrubber.tsx:99-112`) keys off `gestureActive || pendingSeek` — same semantics as today's `isUserScrubbing`.
- `PlaybackService` gains `commandEpoch` (plain getter; incremented in explicit transitions; `setTransportTime`/internal `stopAtEndOfTimeline` do **not** bump it — engine-driven updates are not user commands. `stopAtEndOfTimeline` not bumping means an armed resume can survive hitting the end; the resume's `play()` then restarts from 0 per C7, which is the least-surprise outcome).
- The rAF loop is suspended during `gestureActive`/`pendingSeek` exactly as today (playback is paused), so "only writer" holds by construction.

## Verification design

Existing failing reproductions from this session (scratch `e2e/zzz-*.spec.ts`, gitignored) are promoted into the suite in Milestone 1 — per CLAUDE.md's bug-fix rule, they must fail on master before the fix lands.

| Goal | Verification | Level | Artifact |
| --- | --- | --- | --- |
| G1 | CDP touch tap (60 ms and 250 ms holds) during playback → "Play" title visible and **no state transition for 1 s** (rAF-sampled trace has ≤1 transition) | e2e invariant | `e2e/playback-toggle.spec.ts` (new) |
| G2 | Touch swipe → press play → rAF-sampled trace shows zero uninitiated transitions over 2 s (today: 16+ transitions) | e2e invariant | `e2e/playback-toggle.spec.ts` |
| G3 | Arm a scrub during playback, press pause (button) inside the debounce window → still paused at +1 s; epoch mechanics | unit + e2e | scrub-controller unit test (new, co-located `scrubber/__tests__/`); `e2e/playback-toggle.spec.ts` |
| G4 | Gesture machine: pointerdown + sub-threshold moves + scroll events → stays `idle` | unit | scrub-controller unit test |
| G5 | CDP two-finger pinch during playback → still playing, `pixelsPerSecond` changed, playhead time unchanged (±0.1 s) | e2e invariant | `e2e/timeline-zoom.spec.ts` (new) |
| G6 | Wheel scrub during playback pauses → seeks → resumes; paused scrub doesn't resume; touch momentum seeks once (single `seekTo`) | e2e invariant | existing `scrubber-seek.spec.ts` + `swipe-playback.spec.ts` kept green; momentum single-seek assertion added |
| G6 (never re-seek) | After resume, transport position is continuous (engine time monotonic, no backward jump #94) | unit + e2e | scrub-controller unit test; assertion in `scrubber-seek.spec.ts` |
| G7 | Existing recording e2e stays green; scrub-during-recording no-op assertion | e2e | `e2e/recording.spec.ts` |
| C1–C3 | PlaybackService state machine + epoch increments | unit | `PlaybackService.test.ts` (extend) |
| On-device feel | Tap latency, momentum feel on a real phone | human QA | checklist issue (pattern #467) |

New verification infrastructure required (**Milestone 1**):
- Shared e2e gesture helpers: `touchTap(page, holdMs)`, `swipeTimeline(page, deltaY)` (currently duplicated in `swipe-playback.spec.ts` and session scratch specs), `pinchTimeline(page, scale)` — CDP `Input.dispatchTouchEvent`, per CLAUDE.md.
- **Playback-state flap tracer**: an rAF sampler injected via `page.evaluate` that records `{t, title}` transitions of the play button — turns "no stutter" into a falsifiable count of transitions instead of a timing-lucky visibility poll. (Proven this session; new pattern → `kb/verification.md` on delivery.)

## Milestones

1. **Verification harness** — extract shared gesture helpers + flap tracer into `e2e/fixtures.ts` (or `e2e/helpers/gestures.ts`); land `e2e/playback-toggle.spec.ts` with the G1/G2 reproductions **failing** (committed `test.fail()`-annotated against current behavior, flipped in M2); refactor `swipe-playback.spec.ts` to use the helpers.
2. **Gesture model** — pointercancel/lostpointercapture handling; scrub state machine replacing the boolean flags; movement threshold; rAF-loop/gesture exclusivity. Flips G1/G2/G4/G6 green.
3. **Command epoch** — `PlaybackService.commandEpoch` + controller cancellation; unit tests for every explicit transition; G3 green.
4. **Pinch integration** — wire `isPinchingRef` into the controller; `e2e/timeline-zoom.spec.ts`; G5 green.
5. **KB payback** — gesture-model decision to `kb/decisions.md` (the council record above, once delivered); human-QA checklist issue for on-device feel. (The flap-tracer pattern is already in `kb/verification.md` — captured in the spec session.)

Each milestone is independently landable; M2–M4 each flip a named set of tests.

## Open questions

- **Dual end-of-track mechanisms.** `stopAtEndOfTimeline` (time-equality at 0.1 s granularity, stops preserving position) and the loop's `scrollTop <= 0` fallback (calls `rewind()`, snapping to 0) can disagree; which fires depends on geometry/padding. Evidence to resolve: an e2e that plays a short track to the end and asserts the final position — decide "stop at end" (likely, matches C7's auto-rewind-on-next-play) and make the fallback consistent.
- **Momentum gap >200 ms.** Does real-device momentum ever pause long enough to fire the debounce mid-flick? Evidence: the human-QA checklist; if yes, extend the gesture window while scroll velocity is nonzero (Design dissent).
- **`isAtEndOfTimeline`'s `toFixed(1)` equality** (`PlaybackService.ts:184-189`) misses the end if a frame steps over the 0.1 s bucket. Evidence: unit test sweeping frame deltas; fix is `>=` comparison. Fold into M2 if confirmed.
