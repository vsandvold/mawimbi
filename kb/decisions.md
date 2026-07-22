# Decisions

Architectural decisions with rationale and provenance, newest first. Entry format: date, decision, why, source. When a decision is reversed, mark the old entry **Superseded** with a pointer — don't delete it; the rationale trail is the point.

**Hygiene note:** this file is past the KB's ~150-line guideline (`kb/INDEX.md`) — due a split (e.g. by year, or into `decisions.md` + `decisions-archive.md`) in a future `/harness-audit` or dedicated session, not blocking here.

## 2026-07-22 — `work-issue` ships the PR right after the feature commit; code review moves to a human-gated pause after that

**Decision:** Reordered `work-issue`'s Commit/Review/Pay-back/Ship steps to Commit → Ship (open the PR) → Review (wait for a human to run `/code-review`, then address findings in a separate commit) → Pay back (`/kb write`, its own commit). CLAUDE.md's Working Defaults and Pull Requests sections updated to match — PR creation is no longer gated on running `/code-review` first.
**Why:** `/code-review` has `disable-model-invocation` set (`kb/environment.md`, 2026-07-21) — the agent can never trigger it, only a human typing `/code-review` can. The prior order (review, then ship) implicitly assumed the agent could run review itself before opening the PR; under the real gate that would block PR creation forever. Shipping right after the feature commit keeps `work-issue` able to deliver a PR autonomously, while review still lands as its own commit on the same branch once a human actually runs it — the three-commit shape (feature → review fix → KB) is unchanged, only the step order around it.
**Source:** `.claude/skills/work-issue/SKILL.md`, `CLAUDE.md` (Working Defaults, Pull Requests), `kb/environment.md` (2026-07-21).

## 2026-07-21 — Input monitoring resets to off on every mic close, not just page reload

**Decision:** `MicrophoneService.close()` (spec 005 milestone 3, #524) always tears down monitoring (`disableMonitoring()`) as part of closing the mic, and `RecordingService` mirrors that into its `isMonitoring` signal at every one of its three `microphone.close()` call sites (`closeMicrophoneAndResetMonitoring()`). Practical effect: the user must re-enable monitoring after every recording take (stop or cancel), not just after a page reload.
**Why:** The spec (Decision 3) only specifies "off by default each session (no persistence)" — ambiguous between "once per page load" and "once per mic-open cycle." Resetting on every close is the simpler reading (no need to track "was monitoring on before this arm" across the mic's open/close lifecycle) and the safer one (an audio routing that silently persists across an unrelated take is a stronger footgun than an extra tap). Recorded as an assumption in the PR, not a settled product decision — spec open question 4 already flags this exact ambiguity for on-device QA to resolve; if QA finds users re-enabling every take is annoying, the fix is to stop resetting on close (keep the flag, only clear the Tone-graph connection) rather than adding persistence.
**Source:** Issue #524 (spec 005 milestone 3).

## 2026-07-21 — Recording moves into a bottom-sheet drawer; UI locks gate on the local trigger state, not the service signal it schedules

**Decision:** `RecordingBottomSheet` (spec 005 milestone 2, #523) joins the mixer/lyrics/effects sheets — the toolbar mic button (`FloatingToolbar`) now only opens/closes it, and arming (the old direct arm→count-in toggle) moved to the drawer's own Record/Stop control. Every "is the recording lifecycle locked" check this milestone added — the mic toggle's `disabled`, the drawer's `showClose` — reads `Workstation`'s local `isCountingIn`/`isRecording` state (or a value derived from it), never `RecordingService.isTransportLocked()` directly.
**Why:** `isTransportLocked()` is `recordingState === 'recording' || isCountingIn.value` — both are service signals only written inside `useCountIn`'s effect, and that effect calls `recording.startCountIn()` only *after* `await recording.prepareMicrophone()` resolves. Workstation's own `setIsCountingIn(true)` (the drawer button's click handler) fires synchronously, before that await starts. Gating a lock-dependent control on `isTransportLocked` therefore leaves it live for the real (if short) mic-permission window between "user pressed Record" and "the service caught up" — here, that meant the drawer's close control and the toolbar toggle stayed clickable long enough to close the drawer mid-arm. `isRecordingLocked` (`isRecordingActive || isCountingIn`, `isRecordingActive` from `recording.recordingState !== 'idle'`) doesn't have this gap: `recording.arm()` runs synchronously in the same handler as `setIsCountingIn(true)`, so both flip together. General shape: when a UI trigger sets local state that an effect later mirrors into a service signal via an async operation, gate other UI on the local state (or a value derived from it in the same synchronous handler), not on the mirrored signal — the signal lags by exactly the async operation's duration. Caught in self-review, not `/code-review` (gated to explicit user invocation, not usable by the agent on its own — `kb/environment.md`) — fixed before the review-fix commit landed.
**Source:** Issue #523 (spec 005 milestone 2).

## 2026-07-21 — Spectrogram effects-refresh: per-hook debounce scheduler; render current effects whenever they're non-default, never assume dry

**Decision:** `useSpectrogramCache` (spec 004 M6, #494) owns one `EffectsRefreshScheduler` instance per hook call (i.e. per rendered track), created lazily via a ref rather than as a shared cross-track singleton on `AudioService`. The scheduler debounces `schedule()` calls per track and tracks a monotonic request ID so a slower in-flight render/analyse pair from an older commit can never overwrite a faster newer one (`isSuperseded` checked after each await). Separately, every code path that has *no prior spectrogram entry to compare a hash against* (a fresh track's first-ever analysis, and a stale-on-load correction) renders through `renderTrackOffline(audioBuffer, effects)` whenever `effects` is non-default — it never assumes "no entry yet" implies dry.
**Why:** A per-hook scheduler needs no cross-component signal plumbing to get a refreshed tile set back into the rendering component's state — the same hook instance that schedules the refresh also owns the `setEntry` React state that drives the canvas, so `onRefreshed` just re-reads the cache and sets state directly (workflows-not-reactive-chains, `CLAUDE.md` Design Principles). The "never assume dry" fix closes a real race: a track's mount-time dry analysis takes real time (worker-based CQT pass), during which a fast user can commit an effect change before it resolves — the hook's effect re-runs (aborted via `cancelled`), lands back in the "nothing cached anywhere" branch, but with non-default `effects` this time. Assuming that branch is always dry (true only at upload time, not after an aborted-and-restarted mount pass) would persist a dry-rendered spectrogram tagged with a hash claiming it matches the committed effects — silently wrong on next load's hash check. Caught in code review before shipping, fixed with a red-then-green regression test.
**Source:** Issue #494 (spec 004 milestone 6).

## 2026-07-21 — One user gesture, one dispatch: multi-field changes need a combined reducer action

**Decision:** `useChannelControls.cycleState` (follow-up to #493, persisting volume/mute/solo) dispatches a single `SET_TRACK_MUTE_SOLO` action carrying both fields for every leg of the on→solo→mute→on cycle, including the solo→mute leg where both fields actually change. There is no separate `SET_TRACK_MUTE`/`SET_TRACK_SOLO`.

**Why:** The first version dispatched `SET_TRACK_SOLO` then `SET_TRACK_MUTE` as two calls for the solo→mute leg. `useUndoReducer` pushes one undo-stack entry per `dispatch` call, so one click became two undo steps — a single Undo only reversed the mute half, landing on an intermediate on/on state instead of back at solo. Caught in code review before shipping. The general rule: when one user gesture changes more than one persisted field together, it must be one reducer action (and one dispatch), not one action per field — otherwise undo granularity silently stops matching gesture granularity. `SET_TRACK_EFFECT` and `SET_TRACK_VOLUME` don't need this (each ever changes exactly one field per gesture).

## 2026-07-21 — Undo/redo signal-sync effects must diff against the last value the effect itself saw, not the live signal

**Decision:** `useTrackControlsSync` (spec 004 M5 #493, generalized to volume/mute/solo in the same-day follow-up) — the effect that pushes a track's persisted per-control values back into the live per-track signal after undo/redo — keeps a `Map<TrackId, {effects, volume, mute, solo}>` of the last value it itself observed for each field, and only pushes to the signal when the *persisted* value differs from that last-seen value. It never compares against the live signal's current value. Effects (an object) diffs by reference; volume/mute/solo (primitives) diff by equality — same technique, different comparator.

**Why:** Comparing against the live signal seemed natural (`if (signal.value !== persisted) sync`) but races with any in-progress interaction: `projectPageReducer`'s other actions (`DELETE_TRACK`/`MOVE_TRACK` reindexing, `SET_INSTRUMENT` from background classification) rebuild every `Track` object on every dispatch, but pass unrelated fields through unchanged (by reference for the nested `effects` object, by value for volume/mute/solo — `{...track, index: i}` never touches either). Diffing against the live signal meant *any* unrelated tracks-array change re-pushed the last-committed value into every track's signal, clobbering a slider drag still in progress on a different track. Only the action that actually owns a field ever produces a new/different value for it, so last-seen-value diffing only fires on a genuine change (forward or reverse), never on unrelated churn. Caught in code review before shipping (red-then-green regression test) for effects first, then reused unchanged when volume/mute/solo were added. Generalizes: any effect syncing reducer-owned state back into a live signal for undo/redo should diff against its own last-observed value for that field, not against a signal a live interaction might be writing to concurrently.

## 2026-07-21 — Sparkle bursts decay from a note's onset, not a continuous shower; fixed hue, not track-colored

**Decision:** `simulateSparkles` (#484) fires a single decaying burst (~0.35s) anchored to a note's *onset* (`note.startTime`) — a note held longer than that produces one burst near its onset and then nothing more until it ends, not a continuous shower for its whole duration. The burst's color is a fixed warm red-orange renderer constant, not derived from the track's own color.
**Why:** Spec 003 Q4 left the exact particle lifecycle and color unspecified on purpose (renderer constants, tunable without touching tested logic; feel resolved by the milestone 6 QA checklist). An onset-anchored decay reads as "the note hitting the line" (the welding-spark metaphor) rather than a sustained effect competing with the bars for the note's whole duration, and it's the simplest model that satisfies the "particles expire after max age" acceptance criterion directly. A fixed hue instead of track-coloring sidesteps two problems: the pinned-`Math.random` e2e color-assertion pattern (#21/#36) would otherwise have to account for sparkles too, and — found empirically while building this milestone's e2e test — the meter's translucent background already lets a track's own color bleed through it, so a track-colored sparkle would be materially harder to tell apart from that bleed-through in a screenshot-decoded check (`kb/verification.md`).
**Source:** Issue #484 (spec 003 milestone 5); revisit in milestone 6's human-QA checklist (spec 003 open question, "sparkle look").

## 2026-07-20 — Timeline track lift: one pointer-driven mechanism for fader focus, reorder drag, and edit mode

**Decision:** The timeline's lift/dim treatment is a single CSS mechanism (grouped selectors in `Timeline.css`: lifted → `z-index: 1`, others → `opacity: 0.5`) shared by the mixer focus effect and edit mode; the class names stay distinct because the states have different owners. Focus begin/end is **pointer-lifecycle-driven**: `pointerdown` (primary button only) → `pointerup`/`pointercancel`/`lostpointercapture` → unmount cleanup as last resort; reorder drags participate via an effect on dnd-kit's `isDragging` in `Mixer.tsx` (an effect, not `DndContext` callbacks, because only the effect's cleanup fires when the mixer unmounts mid-drag). The lift wins over mute — interacting with a muted channel reveals its track for the duration, extending #515's edit-mode principle. Keyboard volume changes deliberately get no lift (no reliable release event; the pre-fix behavior left keyboard focus stuck). `focusSignals` stays a membership set, not a refcount — at most one live gesture per track is the documented assumption; overlapping multi-touch gestures may drop the lift early and self-heal on release. *(Numbering superseded the same day — a third tier was inserted between lifted and dimmed; see the entry below.)*
**Why:** The stuck-focus bug came from using Radix Slider's `onValueCommit` as the release edge — it never fires for a press-and-release without a value change (mechanism details: CLAUDE.md, "Radix Slider's `onValueCommit` is not a release event"). Code review then found the remaining stuck paths (unmount mid-press, right-click's swallowed pointerup) — each closed red-then-green. Unifying the CSS also changed edit mode's dim from 0.35/1.0 to the mixer's 0.5/0.9-base — deliberate, per the owner's "identical to the mixer" direction; the e2e guard is a named `MAX_DIMMED_OPACITY = 0.7` bound so a dim creeping toward the base opacity fails perceptibility instead of passing a bare comparison.
**Source:** #515 follow-up tuning session (owner-reported stuck-fader bug, 2026-07-20).

## 2026-07-20 — Mixer reorder-drag adds a live third z-index tier; lift-wins-over-mute narrowed to the manipulated track only

**Decision:** While reordering a channel in the mixer, the timeline's paint order now updates live as the drag crosses other channels, instead of the dragged track alone staying lifted for the whole gesture. A new `focusSignals.dragTargetTrackId` signal (mirrors `focusedTracks`' getter/setter/reset shape) is set from `Mixer.tsx`'s `onDragOver` (dnd-kit's live `over.id`) and cleared from `onDragEnd`/`onDragCancel`/an unmount effect, all routed through one local `clearDragTarget()` — `onDragEnd`'s own clear is load-bearing, not defensive duplication, since a drop's final `onDragOver` reports a real target and nothing else nulls it before `onDragEnd` runs. `Timeline.css` gained a third tier — `.timeline__track--drag-target` (opacity 0.75, z-index 1) between `--foreground`/`--edit-active` (bumped 1→2) and `--background` (0); the runway rails bumped 2→3 to stay above the new ceiling. Separately, "lift wins over mute" was narrowed: only the track actually being manipulated (foreground) reveals when muted — a muted track that's merely the live drag *target* (crossed, not manipulated) stays hidden rather than flickering into view for each row the drag transits.
**Why:** The dragged track sits opaque on top, so reordering z-index only among equally-dimmed background tracks would be invisible — an opaque top layer fully occludes whatever paints behind it regardless of relative order. The intermediate tier is what makes the live reorder actually visible: it steps from track to track as the drag crosses mixer rows. The mute-reveal narrowing was caught by two independent review finders converging on the same bug (a muted track flashing visible from a mere pass-over) — confirmed against a live reproduction (stashed the fix, ran the new e2e assertion, watched it fail, restored). Considered and rejected: switching the whole mechanism to `useSortable`'s per-item reactive `isOver` (confirmed present in the installed `@dnd-kit/sortable` build) to avoid the imperative multi-site clearing — would remove the duplication but requires re-verifying edge-case semantics (does `isOver` ever coincide with the dragged item itself, multi-item swap animations) with no concrete bug driving the change; deferred rather than risked. Also considered and rejected: unifying `focusedTracks`/`dragTargetTrackId`/`editModeSignals.activeEditTrackId` into one "emphasis" concept — real duplication (three structurally identical nullable-TrackId signals) but a large cross-cutting refactor; flagged for a future cleanup pass, not done reactively here.
**Source:** #516 follow-up ("can we make the z-index move while dragging", 2026-07-20).

## 2026-07-20 — Edit mode: mixer-focus-style visuals; channel-level mute/solo bypass with a −12 dB background dim

**Decision:** Edit mode (spec 004) separates the active track with the same mechanism as the mixer-driven focus effect — opacity dim on background tracks plus a z-index lift, nothing else; the phase-1 scale/blur/box-shadow treatment (#490, #508) is gone. Sonically, `TrackService.setEditFocus(trackId|null)` bypasses mute/solo at the channel level and dims every non-active channel by `EDIT_FOCUS_DIM_DB` (−12 dB, ear-tuning deferred to on-device QA); the user's mute/solo/volume signals are never written, so exiting restores the mix exactly. Two guards shipped with it: `AudioChannel` snaps (never ramps) volume writes while its channel is muted, and the dim + mute/solo bypass live in **one** sync effect so the dim deterministically lands before the unmute; `Workstation` re-anchors edit mode to the newest remaining track when the edited track disappears.
**Why:** Owner direction (2026-07-20): every track stays visible while cycling layers, and muting is temporarily suspended so the edited track is always audible over a dimmed — not soloed-away — mix (one-stream principle). The old treatment was also a real cost: every track's canvas covers the full runway window, so per-track `blur()` forced huge filtered composited layers, and the per-track glow duplicated the runway rails (`.timeline::before/::after` stay the single set of runway borders). The snap-while-muted rule extends #492's "silent node → snap params, no zipper risk" rationale — without it, releasing the mute (an instant boolean) while the dim was still ramping let a muted loud track pop ~12 dB hot for 100 ms. The re-anchor guard exists because `pointer-events: none` does not make the toolbar's Undo unreachable (keyboard activation still fires it), and a dangling focus id dims the whole mix with no foreground and no cycle buttons. All three caught/shaped by code review before shipping, each with a red-then-green test.
**Source:** #488 follow-up tuning session (owner direction, 2026-07-20); supersedes the phase-1 visual treatment from #490/#508.

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
**Superseded (2026-07-22):** the three-commit shape (feature → review fix → KB) still holds, but "Review, before Ship" no longer does — Ship (open the PR) now comes right after Commit, and Review moves after Ship as a human-gated pause. See the 2026-07-22 entry below.

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
