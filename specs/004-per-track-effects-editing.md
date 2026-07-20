# 004 — Per-track effects and the spring-modal track-edit mode

**Status:** Draft
**Date:** 2026-07-19
**Issues:** (filled by /spec-to-issues)

## Summary

A per-track editing mode on the runway. Opening the new Effects drawer puts the workstation into a "spring-modal" state: one active track visually separates from the mix — the rest recede — and can be manipulated with a small set of one-knob audio effects (reverb, echo, tone) whose result is audible immediately and reflected in the track's spectrogram shortly after. Swiping left/right on the runway cycles which track is active, with the ascent/descent animated. Closing the drawer collapses everything back into the single mixed view. The edit mode is deliberately designed as the future container for track-editing operations (trim, slip), which are out of scope here.

## Feasibility assessment

The idea is feasible on the current architecture, with four load-bearing findings from grounding:

1. **The "single mixed track" already exists structurally.** All track spectrograms overlap in one CSS grid cell (`Timeline.css`), and a foreground/background emphasis mechanism already ships (`focusSignals.ts` + `timeline__track--foreground/--background` classes, driven today by volume-slider presses). Edit mode is a stronger, modal version of an existing pattern, not a new rendering concept.
2. **A true per-track 3D lift is possible but is the riskiest part.** Giving the active track its own plane via `translateZ` requires `transform-style: preserve-3d` threaded through `.scrubber__tilt → .scrubber__offset → .timeline → .timeline__track`, and the runway's nonlinear projection (`kb/decisions.md` 2026-07-18) means a raw `translateZ` un-anchors the track from the playhead line — a compensating translate must be solved in `runwayProjection`, not approximated in CSS. Meanwhile per-track **2D in-plane transforms** (scale, opacity, filter) compose with the plane's `rotateX` without any preserve-3d and animate cheaply. Hence the phased design below.
3. **Track cycling must animate per-track transforms inside one DOM container.** Rendering the active track in a separate tilt-stage subtree would force React to reparent (unmount/remount) `Spectrogram` components on every swipe — killing canvas/rAF continuity mid-animation. All tracks stay in the one `.timeline` grid; separation is expressed per track element.
4. **The spectrogram can respond for real — no faked visuals needed.** `SpectrogramCache` already exposes `analyse()`/`invalidate()`, the CQT worker is reusable, and the effects chain parameters are serializable, so a post-effect `OfflineAudioContext` render can be re-analysed through the existing pipeline. This is the same **live-then-refine** pattern already established for recording (`kb/domain.md`): audio and the loudness playhead (which taps the post-effect destination) respond instantly; tiles refresh debounced after a parameter commit.

## Grounding

- KB — `kb/product.md`: creative amateur, ease over pro depth; the runway/spectrogram is the product identity and its polish is actively invested in (#443–#469); mobile is first-class (gestures, bottom sheets); mixer stacks newest on top (#20); **one stream, focusable sources** — semi-transparent stacking represents the combined perceptual stream, emphasis/dimming represents selective attention within it, and features must not force isolation where perception wouldn't (owner statement 2026-07-20).
- KB — `kb/domain.md`: two analysis paths and the live-then-refine precedent; `Tone.Transport` is the single clock; runway geometry facts (nonlinear projection; pre-transform scroll clipping).
- KB — `kb/decisions.md`: 2026-07-19 runway is a pure transform stage, PhantomScroller is the only scroll container; 2026-07-18 geometry solved in JS (`runwayProjection.solveGeometry`); 2026-07-18 dev tuning overlay for visual iteration; tap-to-seek rejected — tap toggles playback, drag seeks (#403); 2026-03-11 scaleX narrowing of the *runway transform* rejected (per-track cosmetic in-plane transforms are a different thing: input is owned by the untransformed PhantomScroller, so they touch no hit-testing or geometry solving); 2026-03-03 signal ownership discipline (#200–#208); undo's `recreateChannel` silently lost a non-persisted param once (#212); IndexedDB upgrade/blocked handling (#342).
- Issues/PRs: **#167 (open, `future-plan`) settles the audio insertion point**: `Player → EffectsChain → Channel`, and already calls for a spectrogram cache-invalidation strategy on parameter change. #163 (WebGL compositing) is explicitly *not* required for this. #480 (spec 003 M1) plans the shared screenshot-decode e2e helper this spec also needs. #467 is the human-QA checklist pattern; #469/#180 the profiling-issue pattern. Touch-gesture e2e patterns: PRs #92/#97; `e2e/swipe-playback.spec.ts`.
- Code: `features/tracks/MixerService.ts` (channel chain, `AudioChannel`, volume-in-dB pattern), `features/tracks/focusSignals.ts` + `Timeline.tsx`/`Timeline.css` (emphasis classes), `features/workstation/Workstation.tsx` (`ActiveSheet` state, drawer-height plumbing, `MixerBottomSheet` pattern), `features/workstation/scrubber/` (`useScrubberGeometry`, `runwayProjection`, `ScrubberTilt`, `Scrubber.css`), `features/spectrogram/Spectrogram.tsx` (canvas-window rAF rendering), `features/spectrogram/SpectrogramCache.ts` (`analyse`/`restore`/`invalidate`), `features/project/ProjectStorageService.ts` (`spectrograms` store keyed by trackId), `e2e/runway-geometry.spec.ts` (inline screenshot-decode pattern), `e2e/fixtures/generate-wav.mjs`.

## Goals

1. **Edit mode enter/exit.** Opening the Effects drawer enters per-track edit mode with an active track (default: the newest track — the mixer's top row); closing it collapses back to the mixed view. The active track is visually separated (emphasized; all others recede) with an animated, spring-like transition; `prefers-reduced-motion` disables the animation but not the separation.
2. **Swipe to cycle.** In edit mode, a horizontal swipe on the runway cycles the active track (left = next-newer, right = next-older; stated assumption, validated in human QA). The outgoing and incoming tracks animate continuously; the ends clamp (no wrap-around).
3. **Per-track effects.** Each track has three effects — Space (reverb), Echo (feedback delay), Tone (filter) — each a single 0–100 macro amount where 0 = bypass. The chain sits between `Tone.Player` and `Tone.Channel` (#167). Changes are audible immediately during playback and affect only that track.
4. **Spectrogram responds.** After a parameter commit (debounced), the active track's tiles are re-rendered from a post-effect offline render through the existing CQT pipeline, replacing the dry tiles. The refresh is observable: full-amount Space on a short percussive note adds visible tail energy after the note's dry end.
5. **Persistence and undo.** Effect settings persist with the project, restore on load (including the post-effect spectrogram, without mandatory re-analysis), participate in undo/redo, and survive channel recreation (the #212 regression class).
6. **Existing contracts unchanged.** Tap still toggles playback, drag still seeks, recording still works, and all existing runway-geometry invariants hold with edit mode both on and off.
7. **(Phase 2) True 3D lift.** The active track ascends above the runway on a genuinely lifted plane (`translateZ` + solver-computed compensation keeping its playhead-line content anchored), tunable via the dev tuning overlay.

## Non-goals

- **Track editing operations** (trim, slip, split, move-in-time). The edit mode is the container they will live in; they get their own spec once this ships.
- **Pitch shift / time stretch** (`FUTURE_PLANS.md` §3c) and **panning/spatial** (§3e) — separate DSP tracks of work.
- **Multi-parameter effect UIs or effect automation.** One macro knob per effect is the creative-amateur contract (`kb/product.md`); parameter curves inside the macro are implementation detail.
- **WebGL tile compositing** (#163). The refresh path re-renders tiles; no shader work.
- **Visualizing reverb tails beyond the track's duration.** V1 renders the effected spectrogram at the original duration (audio tails still sound; the visual is truncated). Extending track length is entangled with `totalTime`/scroll-range semantics — revisit only with evidence it confuses users.
- **Wrap-around cycling** and multi-track selection.

## Design

### Council decision record

> **Decision 1 — visual mechanism, phased.** Phase 1 (this spec's core): separation via per-track **2D in-plane transforms + filters** inside the single flattened tilt plane — background tracks dim, blur slightly, and scale down a few percent; the active track keeps full opacity and gains a glow/shadow treatment; spring-timed CSS transitions animate enter/exit/cycle. Phase 2 (final milestone, gated): the true 3D lift — `preserve-3d` through the offset/timeline chain, active track `translateZ(liftPx)` composed with a compensating in-plane translate solved by a new `runwayProjection.solveLift()`, parameters exposed in the dev tuning overlay.
> **Rationale:** Phase 1 needs no preserve-3d (2D child transforms compose with the parent's `rotateX` in the flattened rendering), no reparenting, no new geometry math, and is fully verifiable with existing e2e patterns — it ships the interaction model early. Phase 2 carries the known risks (browser preserve-3d flattening triggers, e.g. any intermediate `overflow`/`opacity`/`filter`; the playhead-anchor compensation being nonlinear) and therefore comes last, behind the tuning overlay (the 2026-07-18 lesson: iterate visuals in seconds, not PRs) and behind pixel-decode e2e gates.
> **Dissent:** *Product* warns phase 1 alone undersells the "hovering plane" identity moment and must not become the permanent state — phase 2 stays in this spec, not a vague follow-up. *Simplicity* predicts the opposite: phase 1 plus shadow/glow may read well enough that phase 2's complexity is never justified — the tuning-overlay session decides with eyes, not argument. *Adversary* predicts cross-browser preserve-3d surprises (Safari especially) and requires the phase-2 e2e gates to run pixel decoding, not rect math, because rects lie under 3D transforms (`kb/verification.md`).

> **Decision 2 — state ownership.** Edit-mode state (`activeEditTrackId: TrackId | null`, plus `enterEditMode`/`exitEditMode`/`cycleActiveTrack`) lives in a new signals module `features/workstation/editModeSignals.ts`, following the `focusSignals.ts` shape (private signal, `signals` accessor, plain getters, reset). The Effects drawer's open/closed state stays an `ActiveSheet` value (`'effects'`) in `Workstation.tsx`, consistent with mixer/lyrics; the drawer workflow calls the signal module's functions directly (workflows coordinate — no reactive chains).
> **Rationale:** the mode is read by `Timeline` (classes), the swipe gesture handler, and rAF-adjacent code — the established signal + bridge-hook channel serves all three; `workstationSignals.ts` (zoom) is the precedent for workstation-owned UI signals. Focus (`focusSignals`) stays separate: it is transient slider feedback, and edit-mode classes take precedence over focus classes in `Timeline.tsx`.
> **Dissent:** *Simplicity* argued for plain `useState` lifted in `Workstation` (like `activeSheet`); overruled because the gesture controller and canvas-adjacent consumers need non-React snapshot reads, which is exactly what the signals pattern provides.

> **Decision 3 — effects chain and spectrogram response.** Audio: `AudioChannel` gains an `EffectsChain` (Space → Echo → Tone as fixed order: `Tone.Reverb`, `Tone.FeedbackDelay`, `Tone.Filter`) inserted per #167; a macro amount of 0 means the effect node is fully bypassed (disconnected, not just wet=0, so idle tracks pay no DSP cost). Effect params are project state: a `SET_TRACK_EFFECT` reducer action (tuple form) makes them persisted and undoable; per-track signals sync them to `MixerService` the same way volume/mute do. Spectrogram: on debounced commit, rebuild source + chain in an offline render (`Tone.Offline`), feed the rendered buffer through `SpectrogramCache.analyse()`, persist the updated `SpectrogramData` plus a params hash; on load, the hash decides whether the persisted spectrogram is current or needs re-analysis.
> **Rationale:** honest visuals — the tiles show the actual post-effect audio, reusing the entire existing analysis pipeline; the loudness playhead already reflects post-effect audio for free (it taps the destination). Commit-debounced refresh avoids re-analysing on every slider tick.
> **Dissent:** *Adversary* flags two risks: (a) `Tone.Offline` requires rebuilding the chain in the offline context (Tone nodes can't be shared across contexts — same family as the `kb/domain.md` context-registry gotcha), so Milestone 1 validates the offline-render shape against real Tone before feature code mocks it (`kb/verification.md`: mock the real API shape); (b) long tracks make re-analysis expensive — accepted for v1 with a profiling issue (pattern #469), since upload already pays the same cost. *Performance* accepted per-commit cost but vetoed any per-frame canvas `filter` approximation of effects — none ships.

### Interaction model

- **Entry points:** an FX button in the toolbar dock opens the Effects drawer (`ActiveSheet 'effects'`), defaulting the active track to the newest. The drawer reuses the `MixerBottomSheet` pattern and reports its height through the existing `handleContentSheetHeightChange` plumbing, so runway geometry re-solves exactly as it does for the mixer.
- **Drawer contents:** active track identity (color swatch, instrument icon, name — reusing `Channel`'s instrument affordances), three labeled macro sliders (Space/Echo/Tone), and prev/next buttons mirroring the swipe (desktop and accessibility path; `kb/product.md`: every mobile gesture needs a non-gesture equivalent and vice versa).
- **Swipe:** horizontal pointer tracking on the PhantomScroller (its `touch-action: pan-y` already leaves horizontal gestures to JS). Axis lock: a gesture that starts predominantly horizontal cycles tracks and suppresses the tap-to-toggle click; vertical scrolling and tap behavior are untouched otherwise. Threshold/velocity handling follows `useBottomSheetDrag`'s conventions.
- **Recording:** entering edit mode is unavailable while `recordingState !== 'idle'` (and count-in), and arming while in edit mode closes the drawer first — the two modal states never overlap.
- **Muted/soloed tracks** stay cycle-able (their spectrograms are hidden at opacity 0 today; in edit mode the active track renders at edit emphasis even if muted, so its effects can be edited — mute governs audio, not editability).
- **Edit mode never auto-solos the active track — settled, not open.** The whole mix keeps playing while editing, because an effect change can only be judged against the mix, and because of the one-stream principle (`kb/product.md`): the visual emphasis/dimming *is* the act of focusing on a source within the stream — auditory isolation would break the very auditory↔visual mapping the edit mode is built on. No isolation toggle ships in v1 either; reintroducing one requires new evidence and a product-principle discussion, not just a QA preference.

### Sequencing note

Milestones 2–3 (edit mode + swipe) and 4–5 (effects + persistence) are independent until the drawer needs real sliders; they can proceed in parallel sessions if desired. Milestone 6 depends on both. Phase 2 (M7) is last and optional-to-defer, but stays in this spec per the council record.

## Verification design

| Goal | Verification | Level | Artifact |
| --- | --- | --- | --- |
| 1 | Enter/exit: open drawer → active track container has `--edit-active` class, others `--edit-background` with computed opacity/filter/transform changed; close → classes gone. Screenshot-decoded pixel assertion that background-track content actually dims (mean luminance drop in a sampled region) — computed style alone is a computed value, not a rendered one. Reduced-motion path via `page.emulateMedia()`. | e2e invariant + decoded pixels | `e2e/track-edit-mode.spec.ts` |
| 2 | CDP touch swipe (established `hasTouch` + `Input.dispatchTouchEvent` pattern) cycles `activeEditTrackId` (asserted via DOM class movement across tracks); swipe at the newest/oldest end leaves it unchanged; a swipe does not toggle playback (play/pause button title unchanged — transition-trace rule from `kb/verification.md`). | e2e invariant | `e2e/track-edit-mode.spec.ts` |
| 3 | Unit: `MixerService`/`EffectsChain` wiring and bypass semantics against the tone mock (chain insert order; amount 0 disconnects; amount >0 connects; per-track isolation). Mock shapes validated in M1 against real Tone (see below). End-to-end audibility is proven jointly with Goal 4 — the tile change *is* the post-effect audio. | unit | `src/features/tracks/__tests__/EffectsChain.test.ts` |
| 4 | Upload the percussive fixture → decode tile pixels in the region after the note's dry end (near-black) → set Space to 100, commit, wait for refresh → same region shows tail energy above a luminance threshold; setting back to 0 restores near-black. Debounce behavior (no re-analysis per slider tick, one per commit) as a unit test on the refresh workflow. | e2e invariant + decoded pixels; unit | `e2e/track-effects.spec.ts`; `src/features/workstation/__tests__/effectsRefresh.test.ts` |
| 5 | fake-indexeddb round-trip: save project with effect params → load → params and spectrogram-params hash restored, no re-analysis triggered when hash matches, re-analysis triggered when stale. Undo: `SET_TRACK_EFFECT` reverse actions; delete-track → undo restores channel *with* effect params (regression test named for the #212 class). | unit | `src/features/project/__tests__/effectsPersistence.test.ts`, reducer/undo tests |
| 6 | Existing suites stay green: `runway-geometry.spec.ts`, `scrubber-seek.spec.ts`, `swipe-playback.spec.ts`, `recording.spec.ts`. New invariant: solved geometry CSS custom properties (`--timeline-padding-*`, `--playhead-fraction`) are identical with edit mode on vs off (phase 1 must not touch geometry). | e2e invariant | existing specs + assertion in `e2e/track-edit-mode.spec.ts` |
| 7 | Phase 2: decoded-pixel assertion that the active track's rendered content shifts/exceeds its phase-1 position while a playhead-line sample of it stays within tolerance of the playhead Y (the solver-compensation invariant); rect math forbidden (`kb/verification.md`). Per-preset look pinned by visual snapshot only if the owner wants it (maintenance cost rule). | decoded pixels (+ optional snapshot) | `e2e/track-edit-lift.spec.ts` |
| feel | Spring animation feel, swipe direction mapping, one-handed reach of the drawer on device | human QA | checklist issue (pattern #467) |
| perf | Re-analysis cost on long tracks; added composited layers; blur filter cost on low-end mobile | profiling issue | issue (pattern #469) |

New verification infrastructure required (→ Milestone 1):

1. **Shared screenshot-decode helper** — extract the inline pattern from `e2e/runway-geometry.spec.ts` into `e2e/pixelUtils.ts`. Coordinate with spec 003's #480, which plans the same helper: whichever lands first, the other consumes it (check #480's status before building).
2. **Percussive fixture** — extend `e2e/fixtures/generate-wav.mjs` with a short decaying burst followed by silence (`test-burst-tail.wav`), so reverb-tail assertions have a known dry-silence region.
3. **Real-shape validation of `Tone.Offline` effect rendering** — a `zzz-` scratch spec (or M1 sub-task) that renders a buffer through `Reverb/FeedbackDelay/Filter` offline in the real browser and records the working API shape, before any unit-test mock of it is written (`kb/verification.md`, mock-the-real-shape rule).

## Milestones

1. **Verification harness** — pixel helper (or adoption of #480's), `test-burst-tail.wav`, offline-render shape validation. No feature code.
2. **Edit-mode state + drawer shell + phase-1 visuals** — `editModeSignals.ts`, `ActiveSheet 'effects'`, FX toolbar button, drawer with track identity + prev/next buttons (sliders inert), Timeline edit classes + transitions, reduced-motion path. Verifies Goals 1 and 6 (button-driven cycling).
3. **Swipe-to-cycle** — horizontal gesture on the phantom with axis lock and tap suppression. Verifies Goal 2.
4. **Effects chain** — `EffectsChain` in `MixerService`, per-track signals, live sliders in the drawer. Verifies Goal 3 (unit level).
5. **Persistence + undo** — reducer action, storage round-trip, params hash stored, #212-class regression test. Verifies Goal 5 (except hash-driven re-analysis, which needs M6).
6. **Spectrogram refresh** — offline re-render + `SpectrogramCache.analyse()` + persisted spectrogram update + debounced commit workflow. Verifies Goal 4 and completes 3 and 5 end-to-end.
7. **Phase-2 3D lift** — `runwayProjection.solveLift()`, preserve-3d chain audit, tuning-overlay parameters, pixel gates; then file the human-QA checklist and profiling issues. Verifies Goal 7.

## Open questions

1. **Does the phase-2 lift survive Safari?** Preserve-3d flattening rules differ in practice. Evidence: the phase-2 pixel e2e run under WebKit (Playwright `webkit` project isn't currently configured — deciding whether to add it, or cover via the human-QA device checklist, happens at M7).
2. **Macro curve tuning** — what Space/Echo/Tone amounts map to musically (wet/decay/feedback/cutoff curves). Resolved by ear during M4, encoded as constants with unit tests on the mapping's monotonicity, and flagged in the human-QA checklist.
3. **Reverb-tail visual truncation** — if QA shows users are confused that the tail sounds but isn't drawn, the non-goal gets revisited (entangled with `totalTime`; would need its own council).
