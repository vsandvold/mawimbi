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
Tone.js uses `standardized-audio-context`, which wraps the native `AudioContext` in a proxy with an internal node registry. `Tone.getContext().rawContext` returns this **wrapper**, and connecting wrapper-created nodes to native nodes throws a "value with the given key could not be found" registry error ([Tone.js #712](https://github.com/Tonejs/Tone.js/issues/712)).

Code that needs native nodes (`WorkletRecorder`/`RecordingProcessor` recording chain, `FrequencyVisualizer`) extracts the real native context via the wrapper's private `_nativeContext` field and creates **all** nodes in the chain on it. If `_nativeContext` is unavailable, fall back to `rawContext` directly. See `AudioService`, `RecordingService.initializeWorkletRecorder()`, and `FrequencyVisualizer` for the established pattern.

### CSS Grid items get z-index stacking contexts; absolutely-positioned pseudo-elements don't
A grid item's `z-index` — even `0`, even with no `position` set — creates a stacking context per the CSS Grid spec. An absolutely-positioned `::before`/`::after` sibling with no explicit `z-index` (defaults to `auto`) does **not** get that treatment: it's out-of-flow, never becomes a grid item, and paints in plain DOM order relative to the grid items' stacking contexts instead of sharing their level. `Timeline.css`'s `.timeline__track` items (`z-index: 0`, `.timeline__track--foreground` at `1`) and its `.timeline::before`/`::after` rail pseudo-elements are exactly this pattern — the rails need an explicit `z-index` higher than any track's to paint consistently on top. Without it, `::before` (generated first) paints under every track, and `::after` (generated last) paints under only the focused one — an asymmetric bug that shipped once already. The same trap applies to any future absolutely-positioned overlay added inside a `z-index`-using grid/flex container.

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

jsdom can't verify real CSS: no paint/stacking order, no pseudo-element computed styles (`getComputedStyle(el, '::before')` returns nothing meaningful), no actual layout. A unit test asserting on inline `style.*` objects (as most of `Scrubber.test.tsx` does) only proves a value was computed, not that it renders correctly. Visual/stacking/pseudo-element behavior needs a Playwright e2e assertion instead — e.g. `page.evaluate(() => getComputedStyle(el, '::before').zIndex)`.

### E2E Tests

Playwright e2e tests live in `e2e/`; visual regression snapshots in `e2e/__screenshots__/`. After implementation changes that affect the UI:

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

**Custom pointer gestures (long-press, drag, swipe):** prefer `locator.dispatchEvent('pointerdown', {...})` over driving raw `page.mouse.move()/down()/up()` coordinates. Much of this app's UI is absolutely-positioned and 3D-transformed (the scrubber/runway, drawer-adjusted overlays), so an element's on-screen bounding box can land at unexpected — even off-viewport — coordinates depending on layout state; raw mouse coordinates can then silently miss the element with no error, while `dispatchEvent` targets it directly regardless of geometry.

**One-off scratch specs:** name throwaway verification specs `e2e/zzz-*.spec.ts` (gitignored) so they're easy to spot and don't risk landing in a commit.

**If `tsc`/`vitest`/`playwright` suddenly fail with missing-package errors:** `node_modules` can be wiped between sessions. Reinstall with `npm ci --onnxruntime-node-install-cuda=skip` (the plain onnx CUDA binary download 403s in sandboxed environments; the flag skips it).

## Pull Requests

After all tasks are done — code changes committed and pushed — run the `/code-review` skill and address confirmed findings, then create a pull request with `gh pr create --repo vsandvold/mawimbi` targeting `master`. Include a summary of what changed and a test plan in the PR body.

## Issue Updates

When working on a GitHub issue, comment on the issue after completing work (`gh issue comment <number> --repo vsandvold/mawimbi`) with:

1. **What was done** — summarize the changes made (files modified, new APIs, patterns followed)
2. **Recommended next steps** — concrete follow-up tasks that remain, numbered in suggested order
