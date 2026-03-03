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
npm test -- src/path/to/File.test.tsx
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

The architecture is organized in layers with clear ownership boundaries. Dependencies point downward.

```
UI Components & Effects    Call bridge hooks for reactive state, call service functions
      │                    for commands, coordinate workflows (count-in, recording lifecycle)
      │
  Bridge Hooks             Translate service signals into plain React-consumable values
      │                    via useSignals() + lazy getters
      │
  Services & Signals       State machines that own and guard their private signals
      │
  Audio Engine             Tone.js / Web Audio API (imperative, side-effectful)
```

### Design Principles

These principles guide architectural decisions. Apply them when adding features, refactoring, or reviewing changes:

- **Signal ownership.** Every signal has exactly one owning service. Only the owner writes to the signal. Other modules call the owner's public functions to request state changes. Never write to a signal you don't own. Signals are private to their owning module — consumers access state through one of two channels:
  - **Plain getters** (`service.playbackState`, `getPixelsPerSecond()`) — return the current value without reactive subscription. Use in tests, workflows, event handlers, and any non-rendering code.
  - **`signals` accessor** (`service.signals.playbackState`) — exposes the underlying `ReadonlySignal` for reactive consumers (bridge hooks). Only used inside `use*Service` / `useWorkstation` hooks that call `useSignals()`.

- **Services as state machines.** Services (`PlaybackService`, `RecordingService`) define their own state, transitions, and guards. They reject invalid transitions silently. Components and hooks call service functions (`play()`, `arm()`, `stopRecording()`) rather than manipulating state directly.

- **Bridge hooks translate signals to React.** Each signal-owning service has a corresponding bridge hook (`usePlaybackService`, `useRecordingService`, `useTrackService`, `useWorkstation`). The hook calls `useSignals()`, reads from `service.signals.*` via lazy getters, and returns plain values and action callbacks. Components never import signals directly. This keeps the reactive boundary in one place per service and makes signal refactors invisible to components.

- **Workflows coordinate, services don't.** When a user action spans multiple services (e.g., recording stop needs to end the recording, create a track, and pause playback), the workflow hook (`useMicrophone`, `useCountIn`) coordinates those calls in sequence. Services stay focused on their own domain. Don't add a reactive intermediary when a direct function call in the workflow is simpler and more readable.

- **Single responsibility per module.** Each module does one thing. `useMicrophone` manages the full recording lifecycle — starting/stopping the audio engine, creating tracks, transitioning recording state, and pausing playback on completion. `usePlaybackService` bridges PlaybackService signals to React components. When a module accumulates unrelated concerns, split it. But don't split a cohesive workflow into pieces just because it touches multiple services — that adds indirection without adding clarity.

- **Encapsulation.** Services expose a public API of functions, plain getters, and a narrow `signals` accessor. Raw writable signals are private. Internal state (like `pendingSeekTime` in PlaybackService) is module-scoped and never exported. Repositories inside services are private. Consumers interact through the defined interface — never by reading `.value` on a signal they obtained outside a bridge hook.

- **Prefer simple over indirect.** A direct call (`pause()`) in a workflow is better than a reactive chain (signal change → effect → service call → another effect → engine call) when the intent is clear and the trigger is already known. Reserve reactive patterns for cases where the producer genuinely shouldn't know about the consumer.

### Services (`src/services/`)

Services own state as private signals, expose plain getters for non-reactive reads, and provide a `signals` accessor for bridge hooks. They define valid transitions and guard against invalid ones.

**PlaybackService** — Owns the playback state machine and transport signals.
- State machine: `stopped → playing ⇄ paused → stopped`
- Signals owned (private): `playbackState`, `transportTime`, `totalTime`, `loudness`, `isPlaying`
- Plain getters: `playbackState`, `transportTime`, `totalTime`, `loudness`, `isPlaying`
- Public API: `play()`, `pause()`, `stop()`, `togglePlayback()`, `rewind()`, `seekTo()`, `consumePendingSeek()`
- Auto-rewinds when playing from end of timeline

**RecordingService** — Owns the recording state machine and count-in signal.
- State machine: `idle → armed → recording → idle`
- Signals owned (private): `recordingState`, `isCountingIn`, `isRecording`
- Plain getters: `recordingState`, `isCountingIn`, `isRecording`
- Public API: `arm()`, `disarm()`, `startRecording()`, `stopRecording()`, `toggleArm()`, `startCountIn()`, `stopCountIn()`, `isTransportLocked()`
- The `armed` state models the GarageBand workflow: arm, position, then play to record

**TrackService** — Owns track creation, per-track signals, and the mixer.
- Signals owned (private): `mutedTracks` (computed from per-track mute/solo)
- Plain getter: `mutedTracks`
- Per-track `volume`/`mute`/`solo` signals are auto-synced to mixer channels via internal effects
- Public API: `createTrack()`, `createRecordedTrack()`, `getSignals()`, `createSignals()`, `disposeSignals()`

**AudioService** — Singleton wrapping Tone.js. Imperative audio engine, no signals.
- Owns `Mixer` (Tone.Player + Tone.Channel chains per track; mute, solo, volume)
- Owns `MicrophoneUserMedia` (Tone.UserMedia wrapper for recording)
- Owns `OfflineAnalyser` (waveform/spectrogram data via offline rendering)

Audio flow: upload → decode `AudioBuffer` + create Blob URL → `Mixer.createChannel()` → `Tone.Transport` controls playback → WaveSurfer 7 renders waveform via `load(blobUrl)`.

### Signals (`src/signals/`)

The `signals/` directory holds cross-cutting signal modules that don't belong to a class-based service. Each module keeps its raw signal private and exports a `signals` accessor (for hooks), plain getter functions (for tests/workflows), and mutation functions.

- **`focusSignals.ts`** — Focused track IDs. Exports `getFocusedTracks()`, `focusTrack()`, `unfocusTrack()`, and `signals.focusedTracks`.
- **`workstationSignals.ts`** — Zoom level. Exports `getPixelsPerSecond()`, `zoomIn()`, `zoomOut()`, `setZoom()`, and `signals.pixelsPerSecond`.

### Bridge Hooks (`src/hooks/use*Service.ts`, `useWorkstation.ts`)

Bridge hooks are the boundary between the signal-based service layer and React components. Each hook calls `useSignals()`, reads from its service's `signals` accessor via lazy getters, and returns plain values and action callbacks. Components never import signals directly.

- **`usePlaybackService`** — Bridges PlaybackService: `playbackState`, `isPlaying`, `transportTime`, `totalTime`, `loudness` + action callbacks.
- **`useRecordingService`** — Bridges RecordingService: `recordingState`, `isCountingIn`, `isRecording` + action callbacks.
- **`useTrackService`** — Bridges TrackService + focusSignals: `mutedTracks`, `focusedTracks` + track creation/retrieval callbacks.
- **`useWorkstation`** — Bridges workstationSignals: `pixelsPerSecond`, `isMaxZoom`, `isMinZoom` + zoom actions.

### State Management

- **Project state** (`projectPageReducer.ts`): Track list, track metadata (color, filename). Dispatch via `useProjectDispatch`.
- **Workstation state**: `isMixerOpen` and `isRecording` are local `useState` in `Workstation.tsx`. `pixelsPerSecond` (zoom level) is a signal.
- **Playback/recording state**: Owned by PlaybackService and RecordingService (see above).
- **Track signals**: Per-track volume, mute, solo owned by `TrackService`. Auto-synced to mixer channels.

### Component Structure

- `src/components/home/` — Landing page with project creation
- `src/components/project/` — Project page container, header with file upload
- `src/components/workstation/` — Core editor: `Timeline`, `Waveform`, `Scrubber`, `Toolbar`, `Mixer`, `Channel`
- `src/components/dropzone/` — Drag-and-drop file upload
- `src/hooks/` — Bridge hooks and shared hooks

### Routing

React Router v7 (library mode) with three routes: Home (`/`), Project (`/project`), and a 404 catch-all.

## File Map

Key source files and their responsibilities:

```
src/
├── index.tsx                          # Bootstrap: Ant Design dark theme + AudioService.startAudio() + BrowserRouter
├── browserSupport.tsx                 # Context for browser capability detection (webkitOfflineAudioContext)
├── setupTests.ts                      # Vitest/RTL global mocks: tone, wavesurfer.js, react-router-dom
├── testUtils.ts                       # Shared test utilities
│
├── services/
│   ├── PlaybackService.ts             # Playback state machine (stopped/playing/paused); private signals +
│   │                                  #   plain getters + signals accessor
│   ├── RecordingService.ts            # Recording state machine (idle/armed/recording); private signals +
│   │                                  #   plain getters + signals accessor
│   ├── TrackService.ts                # Track creation, per-track signals (volume/mute/solo), mixer sync
│   ├── AudioService.ts                # Singleton Tone.js wrapper: transport, recording, offline analysis
│   ├── Mixer.ts                       # Tone.Player + Tone.Channel chain per track; mute/solo/volume
│   ├── MicrophoneUserMedia.ts         # Tone.UserMedia wrapper + meter for microphone input
│   └── OfflineAnalyser.ts             # OfflineAudioContext + AnalyserNode for waveform/spectrogram data
│
├── signals/
│   ├── focusSignals.ts                # Focused track IDs: getFocusedTracks(), focusTrack(), signals.focusedTracks
│   └── workstationSignals.ts          # Zoom level: getPixelsPerSecond(), zoomIn/Out(), signals.pixelsPerSecond
│
├── hooks/
│   ├── usePlaybackService.ts          # Bridge hook: PlaybackService signals → React components
│   ├── useRecordingService.ts         # Bridge hook: RecordingService signals → React components
│   ├── useTrackService.ts             # Bridge hook: TrackService + focusSignals → React components
│   ├── useWorkstation.ts              # Bridge hook: workstationSignals → React components
│   ├── useAudioService.tsx            # Context hook providing AudioService singleton
│   ├── useAnimationFrame.ts           # requestAnimationFrame wrapper
│   ├── useKeypress.tsx                # Window keyup listener (default: spacebar → play/pause)
│   ├── useDebounced.tsx               # Trailing debounce wrapper
│   ├── useThrottled.tsx               # Leading throttle wrapper
│   ├── useTimelineZoom.ts             # Timeline zoom interaction
│   ├── useTrackVolume.ts              # Track volume control
│   ├── useContainerHeight.ts          # Container height measurement
│   └── useUndoReducer.ts             # Undo/redo reducer wrapper
│
├── components/
│   ├── App.tsx                        # Route definitions: /, /project, 404
│   ├── message.ts                     # Ant Design message wrapper with key-based deduplication
│   ├── layout/PageLayout.tsx          # Layout grid: PageLayout, PageHeader, PageContent
│   ├── fullscreen/Fullscreen.tsx      # react-full-screen library wrapper
│   ├── dropzone/Dropzone.tsx          # react-dropzone wrapper for file upload
│   │
│   ├── project/
│   │   ├── ProjectPage.tsx            # Provides ProjectDispatch context + Fullscreen wrapper
│   │   ├── ProjectPageHeader.tsx      # Title, file upload button, fullscreen toggle
│   │   ├── projectPageReducer.ts      # Track list state: ADD_TRACK, DELETE_TRACK, MOVE_TRACK
│   │   ├── projectPageEffects.ts      # useUploadFile (File → AudioService.createTrack), useFullscreen
│   │   ├── useProjectReducer.tsx      # useReducer wrapper with initial state
│   │   └── useProjectDispatch.tsx     # Context consumer hook for project dispatch
│   │
│   └── workstation/
│       ├── Workstation.tsx            # Editor layout; wires bridge hooks and effect hooks
│       ├── Toolbar.tsx                # Playback/record/rewind/mixer toggle controls
│       ├── Timeline.tsx               # Track list: renders Waveform or Spectrogram per track (memoized)
│       ├── Waveform.tsx               # WaveSurfer.js integration per track
│       ├── Spectrogram.tsx            # OfflineAnalyser frequency data visualization
│       ├── Scrubber.tsx               # Playhead indicator + scrubbing interaction
│       ├── Mixer.tsx                  # @dnd-kit drag-and-drop container for track reordering
│       ├── Channel.tsx                # Single track controls: mute/solo buttons, volume slider
│       ├── EmptyTimeline.tsx          # Placeholder shown when no tracks exist
│       └── workstationEffects.ts      # useSpacebarPlaybackToggle, useCountIn, useMicrophone, useMixerHeight,
│                                      #   useTotalTime
│
└── types/
    └── track.ts                       # Track, TrackColor type definitions
```

## Non-Obvious Patterns

### Pending seek pattern
`seekTo(time)` sets a module-scoped `pendingSeekTime` and updates the private `_transportTime` signal. `consumePendingSeek()` reads the buffered seek and applies it to the audio engine atomically with the state transition. This avoids race conditions between signal writes and effect execution.

### Workflow hooks coordinate across services
`useMicrophone` and `useCountIn` are workflow hooks that coordinate multiple services to complete a user-facing interaction. When recording stops, `useMicrophone` calls `endRecording()` (RecordingService), then `pause()` (PlaybackService), then syncs `transportTime` — all in sequence. This is simpler and more readable than routing through reactive intermediaries. Workflows call service functions directly; they don't introduce signal-to-signal relays.

### Project reducer action format is tuple-based
Actions are `[ACTION_TYPE, payload?]` tuples, **not** `{ type, payload }` objects:
```ts
dispatch(['ADD_TRACK', { trackId, fileName }]);
dispatch(['MOVE_TRACK', { fromIndex, toIndex }]);
```

### Repository pattern inside services
`AudioService` owns an `AudioSourceRepository` (decoded `AudioBuffer`s); `Mixer` owns an `AudioChannelRepository` (`Tone.Channel` instances). Both are private and accessed only through their parent service.

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
Channel volume (slider 0–100) is converted to decibels: `20 * Math.log((value + 1) / 101)`. This is applied inside `Mixer.setVolume()`, not in the component.

### Throttle vs. debounce in Channel
- Volume slider → `useThrottled(100ms)` — limits audio engine calls while dragging
- Track unfocus → `useDebounced(250ms)` — batches rapid focus changes

### OfflineAnalyser browser detection
`OfflineAnalyser` auto-detects API support at runtime: uses `OfflineAudioContext.suspend()` if available, otherwise falls back to `ScriptProcessorNode`. This is why `browserSupport.tsx` exists as a context.

### @dnd-kit is PointerSensor only
`Mixer` registers only `PointerSensor` (not `MouseSensor` or `TouchSensor`). This is intentional to unify pointer events across devices.

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
- Tests co-located in `__tests__/` directories next to components
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

