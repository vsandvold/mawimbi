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

### E2E Tests

Playwright e2e tests live in `e2e/`; visual regression snapshots in `e2e/__screenshots__/`. After implementation changes that affect the UI:

1. Run the e2e tests: `npx playwright test e2e/`
2. If a visual regression test fails because the UI intentionally changed, update the snapshot: `npx playwright test e2e/visual.spec.ts -g "<test name>" --update-snapshots`
3. Commit the updated snapshot(s) alongside your code changes

## Pull Requests

After all tasks are done — code changes committed and pushed — run the `/code-review` skill and address confirmed findings, then create a pull request with `gh pr create --repo vsandvold/mawimbi` targeting `master`. Include a summary of what changed and a test plan in the PR body.

## Issue Updates

When working on a GitHub issue, comment on the issue after completing work (`gh issue comment <number> --repo vsandvold/mawimbi`) with:

1. **What was done** — summarize the changes made (files modified, new APIs, patterns followed)
2. **Recommended next steps** — concrete follow-up tasks that remain, numbered in suggested order
