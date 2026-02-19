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

## Code Conventions

- Functional components only, with `React.memo` for performance-sensitive components
- Prettier with single quotes (`singleQuote: true`)
- 2-space indentation, LF line endings (see `.editorconfig`)
- Tests co-located in `__tests__/` directories next to components
- Reducer actions use `CONSTANT_CASE`
- Component files use PascalCase; hooks use `use` prefix

## Testing

Vitest + React Testing Library. Test setup (`setupTests.ts`) globally mocks:
- `tone` — prevents Web Audio API initialization in jsdom
- `wavesurfer.js` — mock `create()` returning `{ load, destroy }` fns
- `react-router-dom` — mock `useNavigate` and `useLocation`

`clearMocks: true` in `vite.config.ts` resets mock call counts between tests.
