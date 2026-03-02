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

The architecture is organized in layers with clear ownership boundaries. Each layer has a single direction of control; dependencies point downward.

```
UI Components          Read signals for rendering, call service functions for commands
      │
  Bridges              React hooks with signal effect() listeners — translate signal
      │                changes into audio engine calls (inversion of control)
      │
  Services & Signals   State machines that own and guard their signals
      │
  Audio Engine         Tone.js / Web Audio API (imperative, side-effectful)
```

### Design Principles

These principles guide architectural decisions. Apply them when adding features, refactoring, or reviewing changes:

- **Signal ownership.** Every signal has exactly one owning service. Only the owner writes to the signal. Other modules read signals or call the owner's public functions to request state changes. Never write to a signal you don't own.

- **Services as state machines.** Services (`PlaybackService`, `RecordingService`) define their own state, transitions, and guards. They reject invalid transitions silently. Components and hooks call service functions (`play()`, `arm()`, `stopRecording()`) rather than manipulating state directly.

- **Reactive bridges, not imperative wiring.** When one subsystem must react to another's state changes, use a bridge — a hook that subscribes to signals via `effect()` and translates changes into actions on the audio engine. Bridges are deliberately simple: they react, they don't decide. This inverts control: the service doesn't need to know who listens; the bridge doesn't need to know why state changed.

- **Single responsibility per module.** Each module does one thing. `useMicrophone` manages the audio engine's recording lifecycle and track creation — it does not control transport time. `useRecordingTransportBridge` pauses playback when recording stops — it does not know about tracks or the microphone. When a module handles two unrelated concerns, split them.

- **Separation of concerns across boundaries.** Recording state and transport-time management are separate responsibilities owned by separate modules. A recording service should not pause playback or sync transport time — that is a transport concern. Identify which domain a behavior belongs to and place it there, even when the trigger crosses domains. Use reactive signals to connect them.

- **Low coupling through signals.** Modules communicate through signals, not direct function calls between peers. `useMicrophone` calls `endRecording()`, which sets `recordingState` to `idle`. `useRecordingTransportBridge` independently reacts to that signal change and pauses playback. Neither module imports or calls the other.

- **Encapsulation.** Services expose a public API of functions and read-only signals. Internal state (like `pendingSeekTime` in PlaybackService) is module-scoped and never exported. Repositories inside services are private. Consumers interact through the defined interface.

### Services (`src/services/`)

Services own state and signals. They define valid transitions and guard against invalid ones.

**PlaybackService** — Owns the playback state machine and transport signals.
- State machine: `stopped → playing ⇄ paused → stopped`
- Signals owned: `playbackState`, `transportTime`, `totalTime`, `loudness`
- Public API: `play()`, `pause()`, `stop()`, `togglePlayback()`, `rewind()`, `seekTo()`, `consumePendingSeek()`
- Auto-rewinds when playing from end of timeline

**RecordingService** — Owns the recording state machine and count-in signal.
- State machine: `idle → armed → recording → idle`
- Signals owned: `recordingState`, `isCountingIn`
- Public API: `arm()`, `disarm()`, `startRecording()`, `stopRecording()`, `toggleArm()`, `startCountIn()`, `stopCountIn()`, `isTransportLocked()`
- The `armed` state models the GarageBand workflow: arm, position, then play to record

**AudioService** — Singleton wrapping Tone.js. Imperative audio engine, no signals.
- Owns `Mixer` (Tone.Player + Tone.Channel chains per track; mute, solo, volume)
- Owns `MicrophoneUserMedia` (Tone.UserMedia wrapper for recording)
- Owns `OfflineAnalyser` (waveform/spectrogram data via offline rendering)

Audio flow: upload → decode `AudioBuffer` + create Blob URL → `Mixer.createChannel()` → `Tone.Transport` controls playback → WaveSurfer 7 renders waveform via `load(blobUrl)`.

### Signals (`src/signals/`)

Signals are the reactive backbone. Services own their signals; the `signals/` directory holds cross-cutting computed signals and signal stores.

- **`transportSignals.ts`** — Backward-compatible facade. Re-exports canonical signals from PlaybackService and RecordingService. Provides computed boolean signals (`isPlaying`, `isRecording`) so older consumers that read `.value` as a boolean continue to work. New code should import from the owning service directly when it needs the full state (e.g., `playbackState` for three-state logic).
- **`trackSignals.ts`** — Per-track signal store (`TrackSignalStore`). Each track has `volume`, `mute`, `solo` signals. Computed `mutedTracks` derives which tracks are muted from per-track mute/solo state.
- **`focusSignals.ts`** — Focused track IDs with debounced unfocus.
- **`workstationSignals.ts`** — Zoom level (`pixelsPerSecond`).

### Bridges (`src/hooks/use*Bridge.ts`)

Bridges are React hooks that subscribe to service signals via `effect()` and translate state changes into audio engine calls. They implement inversion of control: the service sets a signal, the bridge reacts, the audio engine executes.

- **`useTransportBridge`** — Watches `playbackState` → calls `audioService.startPlayback()` / `pausePlayback()` / `stopPlayback()`. Consumes pending seeks atomically with state transitions.
- **`useRecordingTransportBridge`** — Watches `recordingState` → when recording stops (`recording → idle`), pauses playback and syncs `transportTime` from the audio engine. Does not start playback on recording start (count-in orchestrates that).
- **`useAudioBridge`** — Watches per-track `volume`/`mute`/`solo` signals → applies changes to `Tone.Channel` instances.

All three bridges are wired in `Workstation.tsx`.

### State Management

- **Project state** (`projectPageReducer.ts`): Track list, track metadata (color, filename). Dispatch via `useProjectDispatch`.
- **Workstation state**: `isMixerOpen` and `isRecording` are local `useState` in `Workstation.tsx`. `pixelsPerSecond` (zoom level) is a signal.
- **Playback/recording state**: Owned by PlaybackService and RecordingService (see above).
- **Track signals**: Per-track volume, mute, solo in `TrackSignalStore`.

### Component Structure

- `src/components/home/` — Landing page with project creation
- `src/components/project/` — Project page container, header with file upload
- `src/components/workstation/` — Core editor: `Timeline`, `Waveform`, `Scrubber`, `Toolbar`, `Mixer`, `Channel`
- `src/components/dropzone/` — Drag-and-drop file upload
- `src/hooks/` — Shared hooks and bridge hooks

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
│   ├── PlaybackService.ts             # Playback state machine (stopped/playing/paused); owns playbackState,
│   │                                  #   transportTime, totalTime, loudness signals
│   ├── RecordingService.ts            # Recording state machine (idle/armed/recording); owns recordingState,
│   │                                  #   isCountingIn signals
│   ├── AudioService.ts                # Singleton Tone.js wrapper: track creation, transport, recording
│   ├── Mixer.ts                       # Tone.Player + Tone.Channel chain per track; mute/solo/volume
│   ├── MicrophoneUserMedia.ts         # Tone.UserMedia wrapper + meter for microphone input
│   └── OfflineAnalyser.ts             # OfflineAudioContext + AnalyserNode for waveform/spectrogram data
│
├── signals/
│   ├── transportSignals.ts            # Facade: re-exports service signals + computed isPlaying, isRecording
│   ├── trackSignals.ts                # Per-track signal store: volume, mute, solo + computed mutedTracks
│   ├── focusSignals.ts                # Focused track IDs with debounced unfocus
│   └── workstationSignals.ts          # Zoom level: pixelsPerSecond
│
├── hooks/
│   ├── useTransportBridge.ts          # Bridge: playbackState signal → AudioService playback commands
│   ├── useRecordingTransportBridge.ts # Bridge: recordingState signal → pause playback on recording stop
│   ├── useAudioBridge.ts              # Bridge: per-track volume/mute/solo signals → Tone.Channel
│   ├── useAudioService.tsx            # Context hook providing AudioService singleton
│   ├── useAnimation.tsx               # requestAnimationFrame wrapper with FPS throttling
│   ├── useKeypress.tsx                # Window keyup listener (default: spacebar → play/pause)
│   ├── useDebounced.tsx               # Trailing debounce wrapper
│   └── useThrottled.tsx               # Leading throttle wrapper
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
│   │   ├── projectPageReducer.ts      # Track list state: ADD_TRACK, MOVE_TRACK, SET_TRACK_MUTE/SOLO/VOLUME
│   │   ├── projectPageEffects.ts      # useUploadFile (File → AudioService.createTrack), useFullscreen
│   │   ├── useProjectReducer.tsx      # useReducer wrapper with initial state
│   │   └── useProjectDispatch.tsx     # Context consumer hook for project dispatch
│   │
│   └── workstation/
│       ├── Workstation.tsx            # Editor layout; wires all bridges and effect hooks
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
`seekTo(time)` sets a module-scoped `pendingSeekTime` and updates `transportTime.value`. The bridge calls `consumePendingSeek()` when `playbackState` changes, reads the buffered seek, and applies it to the audio engine atomically with the state transition. This avoids race conditions between signal writes and effect execution.

### Cross-domain behavior lives in bridges, not services
When recording stops, playback should pause at the current position. This is a transport concern, not a recording concern. `useMicrophone` calls `endRecording()` which sets `recordingState` to `idle`. `useRecordingTransportBridge` independently reacts to that signal change and pauses playback. Neither module imports or references the other. When adding new cross-domain behavior, follow this pattern: the originating service sets its own signal, and a bridge in the consuming domain reacts.

### Count-in orchestrates playback timing
`useCountIn` is the one place where recording-related code legitimately calls `play()` and `pause()`. It coordinates microphone preparation, lead-in playback timing, and beat counting. This is orchestration, not a bridge — it sequences multiple services to achieve a user-facing interaction. The key distinction: orchestrators are driven by component lifecycle (React state), while bridges are driven by signal changes.

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
- Per-track `mute`/`solo` signals live in `TrackSignalStore` (user intent)
- `mutedTracks` is a computed signal that derives the currently muted track IDs from per-track mute/solo state
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

