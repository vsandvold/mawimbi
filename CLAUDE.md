# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mawimbi is a web-based music creation and audio editing application built with React and TypeScript. Users upload or record audio, visualize tracks as spectrograms (custom CQT analysis + canvas rendering), and manipulate them with playback, recording, mixing, and drag-and-drop reordering. Projects persist to IndexedDB. ML features classify the instrument on each track and transcribe melodies. Deployed on Netlify at https://mawimbi.netlify.app/.

## Commands

```bash
npm start                # Dev server at http://localhost:5173
npm run build            # Production build (tsc -b + vite build)
npm run lint             # ESLint (flat config, eslint.config.js)
npm test                 # Vitest in watch mode
npm run coverage         # Tests with coverage report
npm run test:e2e         # Playwright e2e tests (e2e/)
npm run test:e2e:update  # Playwright with --update-snapshots
```

To run a single test file:
```bash
npm test -- src/features/playback/__tests__/PlaybackService.test.ts
```

The main branch is `master`. Prettier + ESLint run on staged files via Husky pre-commit (lint-staged).

### GitHub CLI

The git remote uses a local proxy URL, so `gh` cannot infer the repo from the remote. Always pass `--repo vsandvold/mawimbi` explicitly:

```bash
gh issue view 19 --repo vsandvold/mawimbi
gh pr create --repo vsandvold/mawimbi ...
```

## Agent Harness

This repo has a harness for autonomous agent work: a knowledge base, a spec pipeline, and audit skills. The loop:

```
idea ──/spec──▶ specs/NNN-*.md ──/spec-to-issues──▶ GH issues ──/work-issue──▶ PRs
         │                                                            │
         └────────────── /kb read (ground) … /kb write (pay back) ────┘
                              /harness-audit keeps it all true
```

Session defaults: **ground nontrivial work with `/kb read` before planning, and capture durable learnings with `/kb write` before finishing.** When a request will clearly span multiple PRs, propose or create a spec first rather than waiting to be asked. The KB holds what/why (product, domain, rationale, verification know-how); CLAUDE.md stays the operating manual — the canonical boundary statement is in `kb/INDEX.md`. Specs pair every requirement with a verification an agent can run (or an explicit human-QA flag), and new verification infrastructure is built before the feature code that needs it; the spec lifecycle is defined in `specs/README.md`. `/council` deliberation is part of `/spec` planning and of architecturally significant decisions — for ordinary ambiguity, the Working Defaults' state-your-assumption rule below applies, not a council. `bash scripts/check-harness.sh` validates harness structure.

## Working Defaults

- Before creating a pull request, run the `/code-review` skill on the diff and address confirmed findings first.
- Before reporting work as complete, verify it: run `npm run lint` and the tests relevant to the change. Only claim what you have evidence for from this session.
- Do the simplest thing that works. No features, refactors, or abstractions beyond what the task requires.
- When a decision is ambiguous, state the assumption you're making and proceed with a recommendation rather than presenting a menu of options.
- Prefer `git stash push -- <file>` over manual backup copies (`cp file file.bak`) when temporarily reverting a file to verify behavior (e.g. confirming a regression test fails without a fix). It's atomic and exact; ad-hoc copies can silently diverge from a linter or dev-server rewrite happening in between.

## Tech Stack

- **React 19** with TypeScript 5, built with **Vite 7** (path alias `@` → `src/`)
- **Tone.js 15** for audio engine (playback, transport, channels)
- **@preact/signals-react** for service-layer state
- **Tailwind CSS 4** + **shadcn/ui** components (Radix primitives) in `src/shared/ui/`; dark theme default via `ThemeProvider` (`shared/hooks/useTheme.tsx`); toasts via **sonner** (wrapped by `shared/message.ts`)
- **React Router 7** (library mode)
- **@dnd-kit** for drag-and-drop track reordering in the Mixer
- **ML**: `@huggingface/transformers` + `onnxruntime-web` + `essentia.js` (instrument classification), `@spotify/basic-pitch` (melody transcription) — inference in Web Workers
- **idb** for IndexedDB persistence
- **Vitest** + React Testing Library (unit), **Playwright** (e2e)
- **Node 22 LTS** (see `.nvmrc`), **npm** as package manager

### Stubbed Node-only dependencies

`package.json` `overrides` replaces two transitive dependencies of `@huggingface/transformers` with an in-repo empty package (`stubs/empty-package`):

- `onnxruntime-node` (208MB of native binaries) — Node-runtime ONNX backend
- `sharp` (33MB with its `@img/*` binaries) — Node-runtime image processing

This app runs all inference in browser Web Workers via `onnxruntime-web` and never touches either package, so stubbing them cuts ~270MB (≈20%) from every install — which also speeds up the remote environment's `node_modules` reclaim recovery (see below).

**Gotcha if a future feature needs them** (running transformers under Node — scripts, SSR, real-inference tests outside the browser — or using sharp): the stub makes imports *resolve successfully to an empty module*, so failures show up as `X is not a function` / `undefined` backend errors at runtime, **not** as a missing-module error at install or build time. If you hit that, delete the corresponding line(s) from `overrides` in `package.json` and run `npm install`. The `file:` overrides are version-independent, so upgrading `@huggingface/transformers` does not require touching them.

## Architecture

The codebase uses a **package-by-feature** structure under `src/features/`. Each feature directory co-locates its service, bridge hook, signals, components, and tests (`__tests__/`). Cross-cutting utilities live in `src/shared/` (hooks, ui, layout, dropzone, fullscreen, log, message). `src/App.tsx` + `src/index.tsx` are the routing shell and bootstrap.

Within each feature, the same layered pattern applies:

```
UI Components & Effects    Read signals for rendering, call service functions for commands,
      │                    coordinate workflows (count-in, recording lifecycle)
      │
  Bridge Hooks             Call useSignals(), translate service signals into React props
      │
  Services & Signals       State machines that own signals and encapsulate audio engine
```

### Features

| Feature | What it owns |
|---------|-------------|
| `audio/` | AudioService (singleton bootstrap), AudioStartup, useAudioService context |
| `playback/` | PlaybackService (state machine), usePlaybackService |
| `recording/` | RecordingService, useRecordingService, MicrophoneService, WorkletRecorder, RecordingProcessor, LatencyCompensation |
| `tracks/` | TrackService, useTrackService, MixerService, focusSignals, LoudnessNormalizer, Track types |
| `spectrogram/` | CQTAnalyser + OfflineAnalyser (offline analysis), LiveCQTAnalyser/WorkletAnalyser/RecordingBuffer (live analysis), SpectrogramCache, tile/canvas/piano-roll renderers, Spectrogram component, worker |
| `classification/` | InstrumentClassificationService, ModelCache, essentiaLoader, melSpectrogram, resample, worker |
| `transcription/` | TranscriptionService, MelodyExtractor (basic-pitch), worker |
| `project/` | ProjectPage, projectPageReducer, projectPageEffects (upload, load, autosave, audio restore), ProjectStorageService (IndexedDB) |
| `workstation/` | Workstation layout, Toolbar/FloatingToolbar, Timeline, Mixer, Channel, bottom sheets (Mixer/Toolbar/Lyrics), CountIn, scrubber/ (Scrubber, Playhead, PhantomScroller, ScrubberViewport, ZoomControls, runwayProjection), workstationEffects (workflows), workstationSignals (zoom) |
| `home/` | HomePage, ProjectList, StorageUsage |
| `settings/` | SettingsPage |

When adding a feature, create a new directory under `features/` and co-locate everything. Cross-feature imports use relative paths (`../../playback/PlaybackService`).

### Design Principles

- **Signal ownership.** Every signal has exactly one owning service or module. Only the owner writes to it. Signals are private; consumers use one of two channels:
  - **Plain getters** (`service.playbackState`, `getPixelsPerSecond()`) — snapshot read, no subscription. For tests, workflows, event handlers.
  - **`signals` accessor** (`service.signals.playbackState`) — exposes a `ReadonlySignal` for reactive consumers. Only used inside bridge hooks that call `useSignals()`.
- **Services as state machines.** Services define their own state, transitions, and guards, and silently reject invalid transitions. Callers use service functions (`play()`, `arm()`), never direct state manipulation.
- **Bridge hooks translate signals to React.** Each signal owner has a co-located `use*` hook that calls `useSignals()`, reads `service.signals.*`, and returns plain values plus action callbacks. Components never import signals directly.
- **Workflows coordinate, services don't.** When a user action spans multiple services, a workflow hook (`useMicrophone`, `useCountIn` in `workstation/workstationEffects.ts`) calls the services in sequence. Prefer a direct call in a workflow over a reactive chain (signal → effect → service → effect) when the trigger is already known.
- **Encapsulation.** Raw writable signals, repositories (`AudioSourceRepository` in TrackService, `AudioChannelRepository` in MixerService), and helpers stay private to their service. Never read `.value` on a signal obtained outside a bridge hook.

### Services

**PlaybackService** (`features/playback/`) — Playback state machine: `stopped → playing ⇄ paused → stopped`. Signals: `playbackState`, `transportTime`, `totalTime`, `loudness`, `isPlaying`. API: `play()`, `pause()`, `stop()`, `togglePlayback()`, `rewind()`, `seekTo()`. Auto-rewinds when playing from the end of the timeline.

**RecordingService** (`features/recording/`) — Recording state machine: `idle → armed → recording → idle`. Signals: `recordingState`, `isCountingIn`, `isRecording`. Encapsulates `MicrophoneService` (Tone.UserMedia wrapper) and `WorkletRecorder` (AudioWorklet PCM capture; silently falls back to `Tone.Recorder` if worklet init fails). API: `arm()`, `disarm()`, `toggleArm()`, `startRecording()`, `stopRecording()`, `startCountIn()`, `stopCountIn()`, `isTransportLocked()`, `prepareMicrophone()`, `closeMicrophone()`, `getLoudness()`, `getMicrophoneSource()`. The `armed` state models the GarageBand workflow: arm, position, then play to record.

**TrackService** (`features/tracks/`) — Track creation/restoration, per-track `volume`/`mute`/`solo` signals (auto-synced to mixer channels via internal effects), computed `mutedTracks`. Encapsulates `MixerService` (Tone.Player + Tone.Channel chain per track). Loudness normalization on upload. `focusSignals.ts` (same directory) owns focused track IDs.

**AudioService** (`features/audio/`) — Singleton that bootstraps the Tone.js context and creates PlaybackService, RecordingService, TrackService, and SpectrogramCache. `AudioService.startAudio()` is invoked once by the `AudioStartup` component on mount; it waits for a user gesture to start the AudioContext. Don't call it elsewhere.

Audio flow: upload → decode `AudioBuffer` + create Blob URL → `TrackService.createTrack()` → `Tone.Transport` controls playback.

### State Management

- **Project state** (`features/project/projectPageReducer.ts`): track list and metadata, with undo via `useUndoReducer`. Persistence lives in `projectPageEffects.ts` (`useLoadProject`, `useAutoSave`, `useRestoreAudio`, `useUploadFile`) backed by `ProjectStorageService` (IndexedDB via `idb`).
- **Workstation UI state**: active bottom sheet (mixer/toolbar/lyrics) and `isRecording` are local `useState` in `Workstation.tsx`. Zoom (`pixelsPerSecond`) is a signal in `workstationSignals.ts`, clamped to 50–800 px/s.
- **Playback/recording/track state**: owned by the services above.

### Routing

React Router 7 (library mode) in `src/App.tsx`: Home (`/`), Project (`/project/:id`), Settings (`/settings`), and a 404 catch-all.

## Non-Obvious Patterns

### Reducer actions are tuples
Both project and workstation reducers use `[ACTION_TYPE, payload?]` tuples, **not** `{ type, payload }` objects:
```ts
dispatch(['ADD_TRACK', { trackId, fileName }]);
dispatch(['MOVE_TRACK', { fromIndex, toIndex }]);
```

### Mixer displays tracks in reverse order
`Mixer.tsx` reverses the track array for visual stacking. Drag-and-drop indices are converted back before dispatching `MOVE_TRACK`, so callers always deal with logical (non-reversed) indices.

### @dnd-kit is PointerSensor only
`Mixer.tsx` registers only `PointerSensor` (not `MouseSensor` or `TouchSensor`), intentionally, to unify pointer events across devices.

### Volume slider uses dB conversion
Channel volume (slider 0–100) is converted to decibels inside `MixerService`: `20 * Math.log((value + 1) / 101)` — not in components.

### Intentional dependency omissions in hooks
Several `useEffect`/`useCallback` deps arrays intentionally omit stable refs (services, `dispatch`) with `eslint-disable-next-line react-hooks/exhaustive-deps` comments. Don't "fix" these — adding the deps causes spurious re-runs.

### Tone.js context is not the native AudioContext
`Tone.getContext().rawContext` returns a **wrapper**, not the native `AudioContext`, and connecting wrapper-created nodes to native nodes throws a "value with the given key could not be found" registry error (why: `kb/domain.md`, "Audio engine"). Code that needs native nodes (`WorkletRecorder`/`RecordingProcessor` recording chain, `FrequencyVisualizer`) extracts the real native context via the wrapper's private `_nativeContext` field and creates **all** nodes in the chain on it. If `_nativeContext` is unavailable, fall back to `rawContext` directly. See `AudioService`, `RecordingService.initializeWorkletRecorder()`, and `FrequencyVisualizer` for the established pattern.

### `transportTime` is not a clock
The `transportTime` signal is written by the scrubber animation loop, which only runs while `playbackState === 'playing'` — it does not advance otherwise. At least four bugs came from trusting it outside playback (#130, #153, #211, #217). Code that needs the real position (recording elapsed time, workflows) must call `playback.getEngineTime()`; this is also why count-in always starts playback even with zero lead-in.

### React Compiler must stay disabled
`babel-plugin-react-compiler` sits in devDependencies but is deliberately not wired into `vite.config.ts` — enabling it breaks `@preact/signals-react` reactivity (why: `kb/decisions.md`, 2026-02-22). Signal reactivity comes from `useSignals()` in bridge hooks instead; don't wire it in as a "modernization".

### Workers loading TF.js need the window polyfill first
`src/shared/workerWindowPolyfill.ts` aliases `globalThis.window = self` and must stay the **first** import in any worker that loads `@spotify/basic-pitch` (see `spectrogram.worker.ts`) — TensorFlow.js references `window` in its setTimeout mechanism and throws `window is not defined` in worker scope otherwise (PR #394).

### CSS Grid items get z-index stacking contexts; absolutely-positioned pseudo-elements don't
A grid item's `z-index` — even `0`, even with no `position` set — creates a stacking context per the CSS Grid spec; an absolutely-positioned `::before`/`::after` sibling with `z-index: auto` does **not**, and paints in plain DOM order instead of sharing the items' level. So any absolutely-positioned overlay inside a `z-index`-using grid/flex container needs an explicit `z-index` above the items'. In this repo: `Timeline.css`'s `.timeline::before`/`::after` rail pseudo-elements over the `.timeline__track` grid items — an asymmetric rails-under-tracks bug shipped once already (fixed in PR #456).

### Two single-class modifiers on the same element don't "compose" — the later-declared one wins
When JS applies two modifier classes of equal specificity to one element (e.g. `.timeline__track--muted` and `.timeline__track--edit-background`, both setting `opacity`), CSS doesn't merge or prioritize by "logical" intent — whichever rule is declared later in the stylesheet wins outright for that property, regardless of which class name reads as more specific in the component. A combined selector (`.a.b { ... }`) has strictly higher specificity than either alone and wins independent of declaration order — use it whenever two modifier classes can legitimately land on the same element and one must dominate. Caught in code review before shipping (spec 004 milestone 2, #490); the concrete example was `Timeline.css`'s edit-mode/mute combined selector (since removed — edit mode no longer hides muted tracks — but the pattern stands).

### Radix Slider's `onValueCommit` is not a release event
It only fires when the interaction changed the value — press the thumb and release without moving, and it never fires (empirically confirmed across five release variants). Never use it as the "end" edge of press-driven UI state (the stuck timeline-focus bug). Drive begin/end from the pointer lifecycle instead: `pointerdown` (primary button only — a right-click's pointerup is swallowed by the context menu) paired with `pointerup`/`pointercancel`/`lostpointercapture` on a wrapper (they bubble out of Radix's pointer capture), plus an unmount cleanup for the component disappearing mid-press. The full pattern: `useChannelControls.ts` + `Channel.tsx`'s `.channel__volume` wrapper. When the value being committed is *persisted* state rather than a transient focus flag, `onValueCommit` is otherwise fine (it fires on every drag that changed the value) — but the same "interaction ends without an event" gap still applies when something *external* interrupts the drag (the drawer force-closing mid-press, e.g. arming for recording, or cycling to another track). `useEffectControls.ts`/`useChannelControls.ts` (#493 and its follow-up) cover this with a per-field dirty flag set on live update and cleared on commit, flushed to a dispatch from an unmount/track-change effect cleanup — the persisted-state sibling of the pointer-lifecycle pattern above.

### Radix Slider must be `value`-controlled, not `defaultValue`, once anything external can change its bound value
`defaultValue` only seeds the initial render — Radix owns the thumb position internally after mount and ignores further `defaultValue` changes, even though a `value` *prop* passed on every render would update. This is invisible until something other than the user's own drag needs to move the slider: `Channel.tsx`'s volume fader shipped as `defaultValue={[volume]}` and worked fine because nothing but the user's own drag ever changed `volume` — until undo/redo needed to revert a committed volume change and the fader silently stayed put while the audio and every other read of the signal updated correctly (the signal write itself was never in question; only the rendered thumb position was stale). Switched to `value={[volume]}`; the round-trip (`onValueChange` → write the live signal → re-render via `@preact/signals-react`'s auto-tracking → fresh `value` prop) already works because the component re-renders reactively on the signal write, so controlling the slider costs nothing during a normal drag — it only matters for external updates. Any slider bound to a signal that undo/redo, restore, or another user's action can update out from under the current interaction needs to be controlled from the start.

### `pointer-events: none` hides from pointers only
A control behind an "hidden" overlay class that only sets `pointer-events: none` (e.g. the toolbar's `toolbar-sheet--hidden` while a content sheet is open) is still focusable and keyboard-activatable — Enter/Space on the focused button fires its `onClick`. Don't treat "behind an open sheet" as unreachable; state that must survive such activation needs its own guard (the stale-edit-focus bug fixed in the #488 tuning session). In e2e, `locator.evaluate((el) => el.click())` models this keyboard path through a pointer-blocked element.

### `Spectrogram.tsx`'s tile-redraw dirty check compares tiles by reference, not count
`drawTilesFrame`'s rAF loop only repaints when `lastDrawnRef`'s tracked state changed; it used to track `tiles.length`, which a same-duration refresh (spec 004 M6's post-effect re-render, #494) never changes — the canvas silently kept showing stale tiles forever, with every non-visual check (analysis ran, cache updated, IndexedDB persisted) green. Fixed by tracking the `tiles` array *reference* instead (`SpectrogramCache.setEntry`/`analyse`/`restore` always construct a fresh array, so identity alone distinguishes "genuinely new tiles" from "same entry, unrelated re-render"). Any future refresh path that replaces a track's spectrogram tiles must go through one of those cache methods (not a hand-rolled cache write) to get a fresh array reference — don't mutate an existing tiles array in place.

## Code Conventions

- Functional components only, with `React.memo` for performance-sensitive components
- Prettier with single quotes; 2-space indentation, LF line endings (`.editorconfig`)
- Tests co-located in `__tests__/` directories within each feature
- Reducer action types use `CONSTANT_CASE`; component files PascalCase; hooks use `use` prefix
- **Function ordering:** callers above callees, public before private
- **Small functions:** one responsibility each; no boolean flag arguments — split into separate functions instead
- **No magic numbers:** extract numeric and string literals into named constants
- **Explaining variables:** extract complex expressions into named variables
- **Comments:** explain _why_, never _what_

## Bug Fixes

When fixing a bug, always write a failing test that demonstrates the bug **before** implementing the fix:

1. Write a unit or e2e test that reproduces the bug and confirm it fails
2. Implement the fix
3. Confirm the previously failing test now passes

## Testing

Vitest + React Testing Library, jsdom environment. `setupTests.ts` globally provides:
- A full mock of `tone` (transport, context with `rawContext`, node factories) — prevents Web Audio API initialization in jsdom
- A `react-router-dom` partial mock: `useNavigate`, `useLocation`, `useParams`
- Stubs for `ResizeObserver` and `HTMLCanvasElement.getContext`

`clearMocks: true` in `vite.config.ts` resets mock call counts between tests. `fake-indexeddb` is available for storage tests.

Tests read service state through plain getters (`service.playbackState`, `getFocusedTracks()`, `getPixelsPerSecond()`), not through `.signals.*.value`.

**On-device debugging:** for ML/audio behavior that only reproduces on the deployed site or a phone (no devtools), use the in-app LogOverlay (`shared/log/`) — it intercepts `console.*` (including worker logs forwarded via a `log` message type) and displays them in an overlay opened from the project header's overflow menu (#278, #279).

jsdom can't verify real CSS: no paint/stacking order, no pseudo-element computed styles (`getComputedStyle(el, '::before')` returns nothing meaningful), no actual layout. A unit test asserting on inline `style.*` objects (as most of `Scrubber.test.tsx` does) only proves a value was computed, not that it renders correctly. Visual/stacking/pseudo-element behavior needs a Playwright e2e assertion instead — e.g. `page.evaluate(() => getComputedStyle(el, '::before').zIndex)`.

### E2E Tests

Playwright e2e tests live in `e2e/`; visual regression snapshots in `e2e/__screenshots__/`.

- **Always import `test`/`expect` from `e2e/fixtures.ts`**, never from `@playwright/test` directly — the fixture blocks ONNX model downloads (classification fires on every track creation, so an unblocked upload test pulls ~50MB from essentia.upf.edu) (#367, #368). `uploadAudioFile` also lives there.
- **No blind waits**: use DOM polling / `expect(...).toPass()` instead of `waitForTimeout` (#367, #386).
- **Reduced motion**: `test.use({ reducedMotion: 'reduce' })` is not honored by the built-in `page` fixture in this environment — use `page.emulateMedia()` (as `runway-geometry.spec.ts` does; PR #457).
- **Pin `Math.random`** in an init script before any visual/color assertion — track colors are randomized across the full palette by design (#21, #36; pattern established in PR #88).
- **Don't bump `@playwright/test` past ^1.56.x** until the remote environment's cached Chromium moves — the version must match the cached browser revision (incident evidence: `kb/environment.md`).

After implementation changes that affect the UI:

1. Run the e2e tests: `npx playwright test e2e/`
2. If a visual regression test fails because the UI intentionally changed, update the snapshot: `npx playwright test e2e/visual.spec.ts -g "<test name>" --update-snapshots`
3. Commit the updated snapshot(s) alongside your code changes

**In a headless/sandboxed environment (no display — e.g. a Claude Code session):** always use `npm run test:e2e:list` (or pass `--reporter=list` explicitly) instead of the default `npm run test:e2e` / `npx playwright test`. `playwright.config.ts`'s `reporter: 'html'` auto-opens the report in a browser on failure whenever `CI` isn't set — harmless with a real display, but with no browser to open it hangs **indefinitely with no error output**, which is easy to mistake for a genuinely stuck test or app bug. Real CI is unaffected: GitHub Actions sets `CI=true`, which the html reporter's own `open` option already treats as `'never'`.

**Iterating on a single spec quickly:** start the dev server once and reuse it across runs instead of paying Playwright's `webServer` startup cost on every invocation (`webServer.reuseExistingServer` is already configured to detect and reuse it):
```bash
nohup npm start > /tmp/vite-dev.log 2>&1 &
until curl -sf http://localhost:5173 > /dev/null; do sleep 1; done
npx playwright test e2e/your-spec.spec.ts --reporter=list
```

**Touch gestures (swipe scrub, touch drag-reorder):** Playwright's mouse API cannot exercise touch paths — use CDP touch events (`Input.dispatchTouchEvent` via `page.context().newCDPSession`) in a `hasTouch: true` context. For @dnd-kit drags, a small (~5px) initial move activates the PointerSensor and movement must be stepped (~10 steps, ~16ms apart) or collision detection never fires (PRs #92, #97; helpers in `e2e/mixer-reorder.spec.ts` and `e2e/swipe-playback.spec.ts`).

**Custom pointer gestures (long-press, drag, swipe):** prefer `locator.dispatchEvent('pointerdown', {...})` over driving raw `page.mouse.move()/down()/up()` coordinates. Much of this app's UI is absolutely-positioned and 3D-transformed (the scrubber/runway, drawer-adjusted overlays), so an element's on-screen bounding box can land at unexpected — even off-viewport — coordinates depending on layout state; raw mouse coordinates can then silently miss the element with no error, while `dispatchEvent` targets it directly regardless of geometry.

**One-off scratch specs:** name throwaway verification specs `e2e/zzz-*.spec.ts` (gitignored) so they're easy to spot and don't risk landing in a commit.

**If `tsc`/`vitest`/`playwright` suddenly fail with missing-package errors:** the remote environment's disk reclaimer wipes `node_modules` — not only between sessions but **mid-session**, even while the dev server keeps running. Run `bash scripts/ensure-deps.sh` — it's a no-op when deps are intact and reinstalls cache-first when they're not (`npm ci --prefer-offline --onnxruntime-node-install-cuda=skip`; the npm cache survives the reclaim, and the onnx flag skips a CUDA binary download that 403s in sandboxes). Run it cheaply before kicking off a long test run. Two more traits of the same reclaim events, so you recognize them instead of misdiagnosing (incident evidence: `kb/environment.md`):

- `df` misleads: "Avail" reflects a fixed per-session write allowance (~28G), not the volume size — a sudden "no space left" with low "Used" means the allowance is spent, and deleting files (e.g. `e2e/test-results/`, stale traces) immediately frees writable space.
- The same reclaim sweep can **silently kill background subagents** mid-task, with no error surfaced. For results you depend on, prefer synchronous subagents or verify that background agents actually returned output rather than assuming silence means still-running.

## Pull Requests

After all tasks are done — code changes committed and pushed — run the `/code-review` skill and address confirmed findings, then create a pull request with `gh pr create --repo vsandvold/mawimbi` targeting `master`. Include a summary of what changed and a test plan in the PR body. When the PR resolves a tracked GitHub issue, include `Closes #<issue-number>` in the body so merging the PR automatically closes the issue — don't wait for a follow-up step to close it.

PR creation is pre-authorized: this is standing permission (per the Executing Actions guidance on durable instructions) to open the PR once work is committed and pushed, without pausing to ask first.

## Issue Updates

When working on a GitHub issue, comment on the issue after completing work (`gh issue comment <number> --repo vsandvold/mawimbi`) with:

1. **What was done** — summarize the changes made (files modified, new APIs, patterns followed)
2. **Recommended next steps** — concrete follow-up tasks that remain, numbered in suggested order

Closing the issue itself is handled by the PR's `Closes #<issue-number>` reference (see Pull Requests), not by this comment — only close it manually if the PR doesn't fully resolve it.
