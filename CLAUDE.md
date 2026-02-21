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

### State Management

Uses React Context + `useReducer` (no Redux). Two independent state domains:

- **Project state** (`projectPageReducer.ts`): Track list, track metadata (color, filename, volume, mute/solo). Dispatch via `useProjectDispatch`.
- **Workstation state** (`workstationReducer.ts`): Playback/recording status, zoom level, transport time, focused/muted tracks, mixer visibility. Dispatch via `useWorkstationDispatch`.

Side effects (file upload, audio playback, recording) are handled in separate `*Effects.ts` files that respond to dispatched actions.

### Audio Service Layer (`src/services/`)

`AudioService` is a **singleton** wrapping Tone.js. It owns:
- `Mixer` — creates/disposes `Tone.Player` + `Tone.Channel` chains per track; handles mute, solo, volume
- `MicrophoneUserMedia` — wraps `Tone.UserMedia` for recording
- `OfflineAnalyser` — generates waveform/spectrogram data offline

Audio flow: upload → decode `AudioBuffer` + create Blob URL → `Mixer.createChannel()` → `Tone.Transport` controls playback → WaveSurfer 7 renders waveform via `load(blobUrl)`.

### Component Structure

- `src/components/home/` — Landing page with project creation
- `src/components/project/` — Project page container, header with file upload
- `src/components/workstation/` — Core editor: `Timeline`, `Waveform`, `Scrubber`, `Toolbar`, `Mixer`, `Channel`
- `src/components/dropzone/` — Drag-and-drop file upload
- `src/hooks/` — Shared hooks: `useAnimation`, `useAudioService`, `useDebounced`, `useKeypress`, `useThrottled`

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
│       ├── Workstation.tsx            # Provides WorkstationDispatch context + editor layout
│       ├── Toolbar.tsx                # Playback/record/mixer toggle controls
│       ├── Timeline.tsx               # Track list: renders Waveform or Spectrogram per track (memoized)
│       ├── Waveform.tsx               # WaveSurfer.js integration per track
│       ├── Spectrogram.tsx            # OfflineAnalyser frequency data visualization
│       ├── Scrubber.tsx               # Playhead indicator + scrubbing interaction
│       ├── Mixer.tsx                  # @dnd-kit drag-and-drop container for track reordering
│       ├── Channel.tsx                # Single track controls: mute/solo buttons, volume slider
│       ├── EmptyTimeline.tsx          # Placeholder shown when no tracks exist
│       ├── workstationReducer.ts      # Playback/UI state: TOGGLE_PLAYBACK, SET_TRANSPORT_TIME, SET_ZOOM, etc.
│       ├── workstationEffects.ts      # usePlaybackControl, useMutedTracks, useMicrophone, useMixerHeight
│       ├── useWorkstationReducer.tsx  # useReducer wrapper with initial state
│       └── useWorkstationDispatch.tsx # Context consumer hook for workstation dispatch
│
├── services/
│   ├── AudioService.ts                # Singleton: track creation, Tone.Transport playback, recording
│   ├── Mixer.ts                       # Tone.Player + Tone.Channel chain per track; mute/solo/volume
│   ├── MicrophoneUserMedia.ts         # Tone.UserMedia wrapper + meter for microphone input
│   └── OfflineAnalyser.ts             # OfflineAudioContext + AnalyserNode for waveform/spectrogram data
│
└── hooks/
    ├── useAudioService.tsx            # Context hook providing AudioService singleton
    ├── useAnimation.tsx               # requestAnimationFrame wrapper with FPS throttling
    ├── useKeypress.tsx                # Window keyup listener (default: spacebar → play/pause)
    ├── useDebounced.tsx               # Trailing debounce wrapper
    └── useThrottled.tsx               # Leading throttle wrapper
```

## Non-Obvious Patterns

### Reducer action format is tuple-based
Actions are `[ACTION_TYPE, payload?]` tuples, **not** `{ type, payload }` objects:
```ts
dispatch(['ADD_TRACK', { id, filename, color }]);
dispatch(['TOGGLE_PLAYBACK']);
```

### Repository pattern inside services
`AudioService` owns an `AudioSourceRepository` (decoded `AudioBuffer`s); `Mixer` owns an `AudioChannelRepository` (`Tone.Channel` instances). Both are private and accessed only through their parent service.

### Mixer displays tracks in reverse order
`Mixer.tsx` reverses the track array for visual stacking. Drag-and-drop indices are converted back before dispatching `MOVE_TRACK`, so callers always deal with logical (non-reversed) indices.

### Muting is dual-layered
- `ProjectState` stores per-track `mute`/`solo` booleans (user intent)
- `WorkstationState` stores the computed array of currently muted track IDs (derived, recalculated by `Mixer.getMutedChannels()` after each change)
- `Timeline` reads from `WorkstationState` for visual styling; `Mixer` reads from `ProjectState` for audio routing

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

