# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mawimbi is a web-based music creation and audio editing application built with React and TypeScript. Users upload audio files, visualize waveforms, and manipulate tracks with playback, recording, mixing, and drag-and-drop reordering. Deployed on Netlify at https://mawimbi.netlify.app/.

## Commands

```bash
npm start         # Dev server at http://localhost:5173
npm run build     # Production build (tsc + vite build)
npm run lint      # ESLint
npm test          # Vitest in watch mode
npm run coverage  # Tests with coverage report
```

To run a single test file:
```bash
npm test -- src/features/playback/__tests__/PlaybackService.test.ts
```

### GitHub CLI

The git remote uses a local proxy URL, so `gh` cannot infer the repo from the remote. Always pass `--repo vsandvold/mawimbi` explicitly:

```bash
gh issue view 19 --repo vsandvold/mawimbi
gh pr create --repo vsandvold/mawimbi ...
```

The main branch is `master`.

`Read` only works on files — passing a directory path returns `EISDIR`. Use `Glob` to explore directory contents instead.

Prettier runs automatically on pre-commit via Husky + lint-staged (ESLint --fix + prettier --write on staged TS/TSX files).

## Tech Stack

- **React 19** with TypeScript 5, built with **Vite 5**
- **Tone.js 14** for audio engine (playback, recording, transport)
- **WaveSurfer.js 7** for waveform visualization
- **Ant Design 5** with dark theme (CSS-in-JS via `ConfigProvider + theme.darkAlgorithm`)
- **React Router 7** (library mode) for routing
- **@dnd-kit** for drag-and-drop track reordering in the Mixer
- **Node 22 LTS** (see `.nvmrc`)
- **npm** as package manager

## Architecture

The codebase uses a **package-by-feature** structure. Each feature directory co-locates its service, bridge hook, signals, components, and tests. Dependencies flow downward through the layer stack, but everything for a feature lives together.

```
src/features/<feature>/        Each feature contains its service, bridge hook,
      │                        signals, components, and tests together
      │
src/shared/                    Cross-cutting utilities: hooks, UI library, layout
      │
src/App.tsx + index.tsx        Routing shell and bootstrap
```

Within each feature, the same layered pattern applies:

```
UI Components & Effects    Read signals for rendering, call service functions for commands,
      │                    coordinate workflows (count-in, recording lifecycle)
      │
  Bridge Hooks             Call useSignals(), translate service signals into React props
      │
  Services & Signals       State machines that own signals and encapsulate audio engine
```

### Feature Directory Layout

Each feature under `src/features/` groups all related code:

| Feature | What it owns |
|---------|-------------|
| `audio/` | AudioService (singleton bootstrap), AudioStartup, useAudioService context |
| `playback/` | PlaybackService (state machine), usePlaybackService (bridge hook) |
| `recording/` | RecordingService, useRecordingService, MicrophoneService, WorkletRecorder, LatencyCompensation |
| `tracks/` | TrackService, useTrackService, MixerService, focusSignals, LoudnessNormalizer, Track types |
| `spectrogram/` | SpectrogramCache, OfflineAnalyser, CQTAnalyser, WorkletAnalyser, Spectrogram component, renderers |
| `classification/` | InstrumentClassificationService, useClassificationService, ML workers, essentia |
| `transcription/` | TranscriptionService, useTranscriptionService, MelodyExtractor, workers |
| `project/` | ProjectPage, ProjectPageHeader, projectPageReducer, projectPageEffects, ProjectStorageService |
| `workstation/` | Workstation, Toolbar, Timeline, Mixer, Channel, Scrubber, workstationEffects (workflows), workstationSignals |
| `home/` | HomePage, ProjectList, StorageUsage |
| `settings/` | SettingsPage |

When adding a new feature, create a new directory under `features/` and co-locate its service, bridge hook, and components. When modifying an existing feature, everything you need is in one directory.

### Design Principles

These principles guide architectural decisions. Apply them when adding features, refactoring, or reviewing changes:

- **Signal ownership.** Every signal has exactly one owning service. Only the owner writes to the signal. Other modules call the owner's public functions to request state changes. Never write to a signal you don't own. Signals are private to their owning module — consumers access state through one of two channels:
  - **Plain getters** (`service.playbackState`, `getPixelsPerSecond()`) — return the current value without reactive subscription. Use in tests, workflows, event handlers, and any non-rendering code.
  - **`signals` accessor** (`service.signals.playbackState`) — exposes the underlying `ReadonlySignal` for reactive consumers (bridge hooks). Only used inside `use*Service` / `useWorkstation` hooks that call `useSignals()`.

- **Services as state machines.** Services (`PlaybackService`, `RecordingService`) define their own state, transitions, and guards. They reject invalid transitions silently. Components and hooks call service functions (`play()`, `arm()`, `stopRecording()`) rather than manipulating state directly.

- **Bridge hooks translate signals to React.** Each signal-owning service has a corresponding bridge hook co-located in the same feature directory. The hook calls `useSignals()`, reads from `service.signals.*` via lazy getters, and returns plain values and action callbacks. Components never import signals directly. This keeps the reactive boundary in one place per service and makes signal refactors invisible to components.

- **Workflows coordinate, services don't.** When a user action spans multiple services (e.g., recording stop needs to end the recording, create a track, and pause playback), the workflow hook (`useMicrophone`, `useCountIn`) in `workstation/workstationEffects.ts` coordinates those calls in sequence. Services stay focused on their own domain. Don't add a reactive intermediary when a direct function call in the workflow is simpler and more readable.

- **Single responsibility per module.** Each module does one thing. `useMicrophone` manages the full recording lifecycle — starting/stopping the audio engine, creating tracks, transitioning recording state, and pausing playback on completion. When a module accumulates unrelated concerns, split it. But don't split a cohesive workflow into pieces just because it touches multiple services — that adds indirection without adding clarity.

- **Encapsulation.** Services expose a public API of functions, plain getters, and a narrow `signals` accessor. Raw writable signals are private. Internal state (like `pendingSeekTime` in PlaybackService) is module-scoped and never exported. Repositories inside services are private. Consumers interact through the defined interface — never by reading `.value` on a signal they obtained outside a bridge hook.

- **Prefer simple over indirect.** A direct call (`pause()`) in a workflow is better than a reactive chain (signal change → effect → service call → another effect → engine call) when the intent is clear and the trigger is already known. Reserve reactive patterns for cases where the producer genuinely shouldn't know about the consumer.

- **Reduce duplication when safe.** When the same logic appears in multiple code paths (e.g., result mapping, logging, state transitions), extract it into a helper — but only when the abstraction is straightforward and the risk of introducing bugs is low. Don't tolerate copy-paste code that drifts apart silently. Conversely, don't force dissimilar code into a shared abstraction just because it looks similar on the surface.

- **Co-locate by feature.** Service, bridge hook, signals, components, and tests for a feature live in the same directory. Cross-feature imports use relative paths (`../../playback/PlaybackService`). Shared utilities live in `src/shared/`. When in doubt about where code belongs, put it with the feature that owns the state it reads or writes.

### Services

Services own state as private signals, expose plain getters for non-reactive reads, and provide a `signals` accessor for bridge hooks. They define valid transitions and guard against invalid ones. Each service lives in its feature directory alongside its bridge hook.

**PlaybackService** (`features/playback/`) — Owns the playback state machine and transport signals.
- State machine: `stopped → playing ⇄ paused → stopped`
- Signals owned (private): `playbackState`, `transportTime`, `totalTime`, `loudness`, `isPlaying`
- Plain getters: `playbackState`, `transportTime`, `totalTime`, `loudness`, `isPlaying`
- Public API: `play()`, `pause()`, `stop()`, `togglePlayback()`, `rewind()`, `seekTo()`
- Auto-rewinds when playing from end of timeline

**RecordingService** (`features/recording/`) — Owns the recording state machine, count-in signal, and microphone.
- State machine: `idle → armed → recording → idle`
- Signals owned (private): `recordingState`, `isCountingIn`, `isRecording`
- Plain getters: `recordingState`, `isCountingIn`, `isRecording`
- Encapsulates `MicrophoneService` (private, same directory) — Tone.UserMedia wrapper for microphone input
- Encapsulates `WorkletRecorder` (private, same directory) — AudioWorklet-based PCM capture; falls back to `Tone.Recorder` if unavailable
- Public API: `arm()`, `disarm()`, `startRecording()`, `stopRecording()`, `toggleArm()`, `startCountIn()`, `stopCountIn()`, `isTransportLocked()`, `prepareMicrophone()`, `closeMicrophone()`, `getLoudness()`, `getMicrophoneSource()`
- The `armed` state models the GarageBand workflow: arm, position, then play to record

**TrackService** (`features/tracks/`) — Owns track creation, per-track signals, and the mixer.
- Signals owned (private): `mutedTracks` (computed from per-track mute/solo)
- Plain getter: `mutedTracks`
- Encapsulates `MixerService` (private, same directory) — Tone.Player + Tone.Channel chains per track
- Per-track `volume`/`mute`/`solo` signals are auto-synced to mixer channels via internal effects
- `focusSignals.ts` (same directory) — Focused track IDs signal module
- `types.ts` (same directory) — `Track`, `TrackColor`, `TrackId` type definitions
- Public API: `createTrack()`, `createRecordedTrack()`, `getSignals()`, `createSignals()`, `disposeSignals()`, `getLoudness()`, `retrieveChannel()`, `recreateChannel()`, `deleteChannel()`

**AudioService** (`features/audio/`) — Singleton that bootstraps the Tone.js audio context and creates sub-services.
- Creates and owns: `PlaybackService`, `RecordingService`, `TrackService`, `SpectrogramCache`
- Configures shared Tone.js context (interactive latency, reduced look-ahead for recording)
- Static: `startAudio()` (context startup on user gesture), `getInstance()` (singleton access)

Audio flow: upload → decode `AudioBuffer` + create Blob URL → `TrackService.createTrack()` → `Tone.Transport` controls playback.

### Signals

Signal modules that don't belong to a class-based service live in the feature directory that owns them. Each module keeps its raw signal private and exports a `signals` accessor (for hooks), plain getter functions (for tests/workflows), and mutation functions.

- **`features/tracks/focusSignals.ts`** — Focused track IDs. Exports `getFocusedTracks()`, `focusTrack()`, `unfocusTrack()`, and `signals.focusedTracks`.
- **`features/workstation/workstationSignals.ts`** — Zoom level. Exports `getPixelsPerSecond()`, `zoomIn()`, `zoomOut()`, `setZoom()`, and `signals.pixelsPerSecond`.

### Bridge Hooks

Bridge hooks are the boundary between the signal-based service layer and React components. Each hook lives in its feature directory next to the service it bridges. The hook calls `useSignals()`, reads from its service's `signals` accessor via lazy getters, and returns plain values and action callbacks. Components never import signals directly.

- **`features/playback/usePlaybackService`** — Bridges PlaybackService: `playbackState`, `isPlaying`, `transportTime`, `totalTime`, `loudness` + action callbacks.
- **`features/recording/useRecordingService`** — Bridges RecordingService: `recordingState`, `isCountingIn`, `isRecording` + action callbacks.
- **`features/tracks/useTrackService`** — Bridges TrackService + focusSignals: `mutedTracks`, `focusedTracks` + track creation/retrieval callbacks.
- **`features/workstation/useWorkstation`** — Bridges workstationSignals: `pixelsPerSecond`, `isMaxZoom`, `isMinZoom` + zoom actions.

### State Management

- **Project state** (`features/project/projectPageReducer.ts`): Track list, track metadata (color, filename). Dispatch via `useProjectDispatch`.
- **Workstation state**: `isMixerOpen` and `isRecording` are local `useState` in `Workstation.tsx`. `pixelsPerSecond` (zoom level) is a signal in `features/workstation/workstationSignals.ts`.
- **Playback/recording state**: Owned by PlaybackService and RecordingService (see above).
- **Track signals**: Per-track volume, mute, solo owned by `TrackService`. Auto-synced to mixer channels.

### Routing

React Router v7 (library mode) with three routes: Home (`/`), Project (`/project`), and a 404 catch-all. Route definitions in `src/App.tsx`.

## File Map

Key source files and their responsibilities:

```
src/
├── index.tsx                          # Bootstrap: Ant Design dark theme + AudioService.startAudio() + BrowserRouter
├── App.tsx                            # Route definitions: /, /project, 404
├── browserSupport.tsx                 # Context for browser capability detection (webkitOfflineAudioContext)
├── setupTests.ts                      # Vitest/RTL global mocks: tone, wavesurfer.js, react-router-dom
├── testUtils.ts                       # Shared test utilities
│
├── features/
│   ├── audio/
│   │   ├── AudioService.ts            # Singleton: bootstraps Tone.js context, creates sub-services
│   │   ├── AudioStartup.tsx           # Audio context startup on user gesture
│   │   └── useAudioService.tsx        # Context hook providing AudioService singleton
│   │
│   ├── playback/
│   │   ├── PlaybackService.ts         # Playback state machine (stopped/playing/paused); owns playbackState,
│   │   │                              #   transportTime, totalTime, loudness signals
│   │   └── usePlaybackService.ts      # Bridge hook: PlaybackService signals → React
│   │
│   ├── recording/
│   │   ├── RecordingService.ts        # Recording state machine (idle/armed/recording); owns recordingState,
│   │   │                              #   isCountingIn signals; encapsulates MicrophoneService
│   │   ├── useRecordingService.ts     # Bridge hook: RecordingService signals → React
│   │   ├── MicrophoneService.ts       # Tone.UserMedia wrapper + meter (private to RecordingService)
│   │   ├── WorkletRecorder.ts         # Main-thread wrapper for AudioWorklet PCM capture
│   │   ├── RecordingProcessor.ts      # AudioWorkletProcessor: captures PCM chunks on audio thread
│   │   └── LatencyCompensation.ts     # Round-trip latency estimation for recording alignment
│   │
│   ├── tracks/
│   │   ├── TrackService.ts            # Track creation, per-track signals, audio sources;
│   │   │                              #   encapsulates MixerService
│   │   ├── useTrackService.ts         # Bridge hook: TrackService + focusSignals → React
│   │   ├── MixerService.ts            # Tone.Player + Tone.Channel chain per track (private to TrackService)
│   │   ├── focusSignals.ts            # Focused track IDs: getFocusedTracks(), focusTrack()
│   │   ├── LoudnessNormalizer.ts      # Volume normalization for uploaded tracks
│   │   └── types.ts                   # Track, TrackColor, TrackId type definitions
│   │
│   ├── spectrogram/
│   │   ├── SpectrogramCache.ts        # In-memory + IndexedDB cache for spectrogram data
│   │   ├── OfflineAnalyser.ts         # OfflineAudioContext + AnalyserNode for spectrogram data
│   │   ├── CQTAnalyser.ts            # Constant-Q Transform analysis
│   │   ├── WorkletAnalyser.ts         # AudioWorklet-based live analysis
│   │   ├── Spectrogram.tsx            # Spectrogram frequency data visualization component
│   │   ├── spectrogramRenderer.ts     # Canvas rendering logic for spectrogram
│   │   ├── spectrogram.worker.ts      # Web Worker for background analysis
│   │   └── useSpectrogramCache.ts     # Hook for spectrogram cache access
│   │
│   ├── classification/
│   │   ├── InstrumentClassificationService.ts  # ML instrument classification
│   │   ├── useClassificationService.ts         # Bridge hook for classification results
│   │   ├── classification.worker.ts            # Web Worker for ML inference
│   │   └── instrumentLabels.ts                 # Human-readable instrument names
│   │
│   ├── transcription/
│   │   ├── TranscriptionService.ts    # ML audio transcription
│   │   ├── useTranscriptionService.ts # Bridge hook for transcription results
│   │   ├── MelodyExtractor.ts         # Melody extraction from audio
│   │   └── types.ts                   # Transcription, TranscriptionSegment types
│   │
│   ├── project/
│   │   ├── ProjectPage.tsx            # Provides ProjectDispatch context + Fullscreen wrapper
│   │   ├── ProjectPageHeader.tsx      # Title, file upload button, fullscreen toggle
│   │   ├── projectPageReducer.ts      # Track list state: ADD_TRACK, DELETE_TRACK, MOVE_TRACK
│   │   ├── projectPageEffects.ts      # useUploadFile (File → AudioService.createTrack), useFullscreen
│   │   ├── useProjectReducer.tsx      # useReducer wrapper with initial state
│   │   ├── useProjectDispatch.tsx     # Context consumer hook for project dispatch
│   │   └── ProjectStorageService.ts   # IndexedDB persistence for projects and audio data
│   │
│   ├── workstation/
│   │   ├── Workstation.tsx            # Editor layout; wires effect hooks
│   │   ├── workstationEffects.ts      # Workflow hooks: useCountIn, useMicrophone,
│   │   │                              #   useSpacebarPlaybackToggle, useTotalTime
│   │   ├── workstationSignals.ts      # Zoom level: getPixelsPerSecond(), zoomIn/Out()
│   │   ├── useWorkstation.ts          # Bridge hook: workstationSignals → React
│   │   ├── Toolbar.tsx                # Playback/record/rewind/mixer toggle controls
│   │   ├── Timeline.tsx               # Track list: renders Spectrogram per track (memoized)
│   │   ├── Mixer.tsx                  # @dnd-kit drag-and-drop container for track reordering
│   │   ├── Channel.tsx                # Single track controls: mute/solo buttons, volume slider
│   │   ├── useChannelControls.ts      # Per-track signal access for Channel
│   │   ├── EmptyTimeline.tsx          # Placeholder shown when no tracks exist
│   │   └── scrubber/
│   │       └── Scrubber.tsx           # Playhead indicator + scrubbing interaction
│   │
│   ├── home/
│   │   ├── HomePage.tsx               # Landing page with project list
│   │   ├── ProjectList.tsx            # Saved projects list
│   │   └── StorageUsage.tsx           # Storage quota display
│   │
│   └── settings/
│       └── SettingsPage.tsx           # App settings
│
└── shared/
    ├── hooks/
    │   ├── useAnimationFrame.ts       # requestAnimationFrame wrapper
    │   ├── useKeypress.tsx            # Window keyup listener (default: spacebar → play/pause)
    │   ├── useDebounced.tsx           # Trailing debounce wrapper
    │   ├── useThrottled.tsx           # Leading throttle wrapper
    │   ├── useTimelineZoom.ts         # Timeline zoom interaction
    │   ├── useTrackVolume.ts          # Track volume control
    │   ├── useContainerDimensions.ts  # Container width/height measurement
    │   └── useUndoReducer.ts          # Undo/redo reducer wrapper
    ├── ui/                            # ShadCN UI component library (button, slider, dialog, etc.)
    ├── layout/PageLayout.tsx          # Layout grid: PageLayout, PageHeader, PageContent
    ├── dropzone/Dropzone.tsx          # react-dropzone wrapper for file upload
    ├── fullscreen/Fullscreen.tsx      # react-full-screen library wrapper
    ├── log/                           # LogService, useLogService, LogOverlay
    └── message.ts                     # Ant Design message wrapper with key-based deduplication
```

## Non-Obvious Patterns

### Workflow hooks coordinate across services
`useMicrophone` and `useCountIn` are workflow hooks that coordinate multiple services to complete a user-facing interaction. When recording stops, `useMicrophone` calls `stopRecording()` (RecordingService), then `pause()` (PlaybackService), then syncs `transportTime` — all in sequence. This is simpler and more readable than routing through reactive intermediaries. Workflows call service functions directly; they don't introduce signal-to-signal relays.

### Project reducer action format is tuple-based
Actions are `[ACTION_TYPE, payload?]` tuples, **not** `{ type, payload }` objects:
```ts
dispatch(['ADD_TRACK', { trackId, fileName }]);
dispatch(['MOVE_TRACK', { fromIndex, toIndex }]);
```

### Repository pattern inside services
`TrackService` owns an `AudioSourceRepository` (decoded `AudioBuffer`s); `MixerService` owns an `AudioChannelRepository` (`Tone.Channel` instances). Both are private and accessed only through their parent service.

### Mixer displays tracks in reverse order
`Mixer.tsx` reverses the track array for visual stacking. Drag-and-drop indices are converted back before dispatching `MOVE_TRACK`, so callers always deal with logical (non-reversed) indices.

### Muting uses signals
- Per-track `mute`/`solo` signals live in `TrackService`'s private signal store (user intent)
- `mutedTracks` is a computed signal (private to TrackService) that derives the currently muted track IDs; exposed via plain getter and `signals` accessor
- `Timeline` and `Mixer` both read from signals for visual styling and audio routing

### AudioService initialisation on app boot
`AudioService.startAudio()` is `await`ed in `src/index.tsx` before rendering. This starts the Tone.js `AudioContext` and must happen in response to user gesture (handled by the library). Don't call it elsewhere.

### Intentional dependency omissions in hooks
`useEffect`/`useCallback` deps arrays intentionally omit `audioService` and `dispatch` refs with inline comments. These are stable across renders; adding them would cause spurious re-runs.

### Volume slider uses dB conversion
Channel volume (slider 0–100) is converted to decibels: `20 * Math.log((value + 1) / 101)`. This is applied inside `AudioChannel.volume` (in MixerService), not in the component.

### Throttle vs. debounce in Channel
- Volume slider → `useThrottled(100ms)` — limits audio engine calls while dragging
- Track unfocus → `useDebounced(250ms)` — batches rapid focus changes

### OfflineAnalyser browser detection
`OfflineAnalyser` auto-detects API support at runtime: uses `OfflineAudioContext.suspend()` if available, otherwise falls back to `ScriptProcessorNode`. This is why `browserSupport.tsx` exists as a context.

### @dnd-kit is PointerSensor only
`Mixer.tsx` registers only `PointerSensor` (not `MouseSensor` or `TouchSensor`). This is intentional to unify pointer events across devices.

### Tone.js context is not the native AudioContext
Tone.js v14+ uses `standardized-audio-context`, which wraps the native browser `AudioContext` in a proxy that maintains an internal node registry. `Tone.getContext().rawContext` returns this **wrapper**, not the native `AudioContext`. The wrapper's `instanceof AudioContext` check returns `false`.

This wrapper breaks `AudioWorkletNode` connections — calling `.connect()` between a wrapper-created node and a native node triggers a "value with the given key could not be found" error from the internal registry ([Tone.js #712](https://github.com/Tonejs/Tone.js/issues/712)).

The worklet recording path (`WorkletRecorder`, `RecordingProcessor`) bypasses this entirely by extracting the actual native `AudioContext` via `rawContext._nativeContext` (a private field on the standardized-audio-context wrapper). All nodes in the worklet chain — `MediaStreamSourceNode`, `AudioWorkletNode`, and `destination` — are created on the native context. This avoids the registry and keeps the recording path fully native. The `_nativeContext` extraction happens once in `RecordingService.initializeWorkletRecorder()` and is stored for reuse during recording.

If `_nativeContext` is unavailable (e.g., the context is already native), the code falls back to using `rawContext` directly. If worklet initialization fails entirely, `RecordingService` silently falls back to `Tone.Recorder` (MediaRecorder-based).

### Signal access pattern
Every signal owner (service or signal module) provides three tiers of access:
1. **Private signal** (`_playbackState`, `_pixelsPerSecond`) — only the owner writes
2. **Plain getter** (`service.playbackState`, `getPixelsPerSecond()`) — snapshot read, no subscription. Used in tests, workflows, event handlers
3. **`signals` accessor** (`service.signals.playbackState`, `signals.pixelsPerSecond`) — `ReadonlySignal` for reactive consumers. Only used inside bridge hooks that call `useSignals()`

Tests should use plain getters (e.g., `service.playbackState` not `service.signals.playbackState.value`). Components should use bridge hooks (e.g., `usePlaybackService().playbackState`), never import signals directly.

## Code Conventions

- Functional components only, with `React.memo` for performance-sensitive components
- Prettier with single quotes (`singleQuote: true`)
- 2-space indentation, LF line endings (see `.editorconfig`)
- Tests co-located in `__tests__/` directories within each feature
- Reducer actions use `CONSTANT_CASE`
- Component files use PascalCase; hooks use `use` prefix

## Code Style

- **Function ordering:** Callers above callees. Public before private.
- **Small functions:** One responsibility per function. No boolean flag arguments — split into separate functions instead.
- **No magic numbers:** Extract numeric and string literals into named constants.
- **Explaining variables:** Extract complex expressions into named variables rather than inlining them.
- **Comments:** Explain _why_, never _what_. Code should be self-explanatory; comments document intent and reasoning.

## Bug Fixes

When fixing a bug, always write a failing test that demonstrates the bug **before** implementing the fix. This confirms the test correctly captures the bug and ensures the fix is verified by the test rather than assumed correct.

1. Write a unit or e2e test that reproduces the bug and confirm it fails
2. Implement the fix
3. Confirm the previously failing test now passes

## Testing

Vitest + React Testing Library. Test setup (`setupTests.ts`) globally mocks:
- `tone` — prevents Web Audio API initialization in jsdom
- `wavesurfer.js` — mock `create()` returning `{ load, destroy }` fns
- `react-router-dom` — mock `useNavigate` and `useLocation`

`clearMocks: true` in `vite.config.ts` resets mock call counts between tests.

Tests read service state through plain getters (`service.playbackState`, `getFocusedTracks()`, `getPixelsPerSecond()`), not through `.signals.*.value`. This keeps tests decoupled from signal internals and makes assertions more readable.

### E2E Tests

Playwright e2e tests live in `e2e/`. Visual regression snapshots are stored in `e2e/__screenshots__/`. After completing implementation changes that affect the UI, always:

1. Run the e2e tests to check for failures: `npx playwright test e2e/`
2. If a visual regression test fails because the UI intentionally changed, update the snapshot: `npx playwright test e2e/visual.spec.ts -g "<test name>" --update-snapshots`
3. Commit the updated snapshot(s) alongside your code changes

## Pull Requests

After all tasks are done — code changes committed and pushed — create a pull request using `gh pr create --repo vsandvold/mawimbi`. Target the `master` branch. Include a summary of what changed and a test plan in the PR body.

## Issue Updates

When working on a GitHub issue, comment on the issue after completing work. Use `gh issue comment <number> --repo vsandvold/mawimbi`. The comment should include:

1. **What was done** — summarize the changes made (files modified, new APIs, patterns followed)
2. **Recommended next steps** — list concrete follow-up tasks that remain, numbered to show suggested order

