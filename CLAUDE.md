# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mawimbi is a web-based music creation and audio editing application built with React and TypeScript. Users upload audio files, visualize waveforms, and manipulate tracks with playback, recording, mixing, and drag-and-drop reordering. Deployed on Netlify at https://mawimbi.netlify.app/.

## Commands

```bash
yarn start        # Dev server at http://localhost:3000
yarn build        # Production build
yarn test         # Jest in watch mode
yarn coverage     # Tests with coverage report
```

To run a single test file:
```bash
yarn test -- --testPathPattern="<filename>"
```

There is no separate lint command; ESLint runs via CRA's built-in integration. Prettier runs automatically on pre-commit via husky + lint-staged.

## Tech Stack

- **React 16** with TypeScript 3.9, bootstrapped with Create React App (customized via react-app-rewired)
- **Tone.js** for audio engine (playback, recording, transport)
- **WaveSurfer.js** for waveform visualization (with spectrogram fallback)
- **Ant Design** with dark theme (configured in `config-overrides.js` via Less)
- **Node 12.16.3** (see `.nvmrc`)
- **Yarn** as package manager

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

Audio flow: upload → decode `AudioBuffer` → `Mixer.createChannel()` → `Tone.Transport` controls playback → WaveSurfer renders visualization.

### Component Structure

- `src/components/home/` — Landing page with project creation
- `src/components/project/` — Project page container, header with file upload
- `src/components/workstation/` — Core editor: `Timeline`, `Waveform`, `Scrubber`, `Toolbar`, `Mixer`, `Channel`
- `src/components/dropzone/` — Drag-and-drop file upload
- `src/hooks/` — Shared hooks: `useAnimation`, `useAudioService`, `useDebounced`, `useKeypress`, `useThrottled`

### Routing

React Router v5 with three routes: Home (`/`), Project (`/project`), and a 404 catch-all.

## Code Conventions

- Functional components only, with `React.memo` for performance-sensitive components
- Prettier with single quotes (`singleQuote: true`)
- 2-space indentation, LF line endings (see `.editorconfig`)
- Tests co-located in `__tests__/` directories next to components
- Reducer actions use `CONSTANT_CASE`
- Component files use PascalCase; hooks use `use` prefix

## Testing

React Testing Library + Jest. Test setup (`setupTests.ts`) mocks `react-router-dom` (useHistory, useLocation) and `wavesurfer.js` globally, and silences Tone.js logging.
