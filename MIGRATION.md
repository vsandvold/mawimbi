# Architecture Migration Plan: Signal-Synced Audio

Migrate Mawimbi from **Context + useReducer** to a **Signal-Synced Audio Architecture** as proposed in [#100](https://github.com/vsandvold/mawimbi/issues/100). Each phase is independently deployable and the app remains fully functional after every step.

---

## Motivation

The current architecture routes every high-frequency UI change (volume sliders, transport position, mute/solo) through React's reconciliation engine:

```
UI Event → dispatch → Reducer → State Update → Component Re-render → useEffect → Audio Engine
```

This creates unnecessary re-renders (the entire component tree on every slider tick) and adds 16–32 ms of latency between a user gesture and the audio response.

The target architecture uses **Preact Signals** to bypass React for high-frequency state, pushing values directly to Web Audio parameters:

```
UI Event → Signal → effect() → AudioParam.rampTo()
```

Low-frequency state (track list, routing, UI layout) stays in React reducers where it belongs.

---

## Current vs. Target State Classification

| State | Frequency | Current Owner | Target Owner |
|---|---|---|---|
| Track volume | High (slider drag) | `projectReducer` | Signal |
| Transport time | High (every frame) | `workstationReducer` | Signal |
| Loudness meter | High (every frame) | Direct DOM via ref | Signal |
| Track mute/solo | Medium (clicks) | `projectReducer` | Signal |
| Track focus/unfocus | Medium (debounced) | `workstationReducer` | Signal |
| Computed muted tracks | Medium (derived) | `workstationReducer` | Computed signal |
| Playback status | Low (toggle) | `workstationReducer` | Signal |
| Track list (add/move) | Low (user action) | `projectReducer` | Reducer (unchanged) |
| Track metadata (name, color) | Low (never changes) | `projectReducer` | Reducer (unchanged) |
| Mixer open/close | Low (toggle) | `workstationReducer` | Reducer (unchanged) |
| Zoom / pixelsPerSecond | Low (rare) | `workstationReducer` | Reducer (unchanged) |

---

## Target Directory Structure

New directories are introduced alongside the existing structure. No existing directories are moved or renamed until the final cleanup phase.

```
src/
├── signals/                        ← NEW: reactive state outside React
│   ├── trackSignals.ts             # Per-track signals: volume, mute, solo
│   ├── transportSignals.ts         # Transport time, playback state, loudness
│   └── focusSignals.ts             # Track focus state for visual styling
│
├── hooks/
│   ├── useAudioBridge.ts           ← NEW: signal effects → Tone.js params
│   ├── useTransportBridge.ts       ← NEW: signal effects → Tone.Transport
│   ├── useAudioService.tsx         # Unchanged
│   ├── useAnimation.tsx            # Unchanged (removed in Phase 4)
│   └── ...
│
├── services/                       # Unchanged
├── components/                     # Gradually updated to read signals
└── ...
```

---

## Phase 1: Foundation

**Goal:** Install dependencies, configure build tooling, create the signals infrastructure. Zero behavior changes — the app runs exactly as before.

### 1.1 Install dependencies

```bash
npm install @preact/signals-react
npm install --save-dev babel-plugin-react-compiler
```

### 1.2 Configure the React Compiler in Vite

Add the Babel plugin to `vite.config.ts` so the compiler automatically memoizes components and hooks, replacing manual `React.memo`, `useMemo`, and `useCallback` usage.

**File:** `vite.config.ts`

```ts
react({
  babel: {
    plugins: [['babel-plugin-react-compiler', { target: '19' }]],
  },
})
```

### 1.3 Add Cross-Origin Isolation headers

Required for future `SharedArrayBuffer` support (AudioWorklets). Add to the Vite dev server config now so the headers are in place when needed.

**File:** `vite.config.ts`

```ts
server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
}
```

> **Note:** COEP `require-corp` may break external resource loading (fonts, CDN scripts). Test thoroughly. If issues arise, defer this to a later phase or use `credentialless` instead.

### 1.4 Create the signals module

Create `src/signals/trackSignals.ts`:

- Define a `TrackSignals` type: `{ volume: Signal<number>, mute: Signal<boolean>, solo: Signal<boolean> }`
- Export a `TrackSignalStore` — a `Map<TrackId, TrackSignals>` with `create(trackId)` and `dispose(trackId)` functions
- `create()` initializes signals with default values (volume: 100, mute: false, solo: false)

Create `src/signals/transportSignals.ts`:

- Export `transportTime: Signal<number>` (initial: 0)
- Export `isPlaying: Signal<boolean>` (initial: false)
- Export `loudness: Signal<number>` (initial: 0)

Create `src/signals/focusSignals.ts`:

- Export `focusedTracks: Signal<TrackId[]>` (initial: [])
- Export helper functions: `focusTrack(id)`, `unfocusTrack(id)`

### 1.5 Set up test utilities for signals

Update `src/setupTests.ts` or create `src/signals/__tests__/testUtils.ts` with helpers to reset signal state between tests, preventing test pollution.

### Verification

- `npm run build` succeeds
- `npm run lint` passes
- `npm test` — all existing tests pass
- App runs with identical behavior

---

## Phase 2: Volume Signals

**Goal:** Migrate per-track volume from the reducer to signals. This is the highest-impact change — it eliminates component-tree re-renders on every slider tick.

### Current flow (6 hops)

```
Slider onChange
  → useThrottled(100ms)
  → projectDispatch([SET_TRACK_VOLUME])
  → projectReducer creates new tracks[]
  → Workstation re-renders (tracks changed)
  → Channel useEffect detects volume change
  → audioChannel.volume = value (rampTo internally)
```

Additionally, `Waveform.tsx` reads `track.volume` for opacity, so every volume change triggers waveform re-renders too.

### Target flow (2 hops)

```
Slider onInput → trackSignals.get(id).volume.value = newValue
  → signal effect() → audioChannel.volume.rampTo(dB, 0.05)
```

### 2.1 Create the audio bridge for volume

**New file:** `src/hooks/useAudioBridge.ts`

For each track in the `TrackSignalStore`, set up a signal `effect()` that:
1. Reads `trackSignals.get(trackId).volume.value`
2. Retrieves the `AudioChannel` from `audioService.mixer`
3. Calls `audioChannel.volume = value` (which internally ramps to dB)

This hook is called once in `Workstation.tsx`. The effects auto-dispose when the component unmounts.

### 2.2 Wire up signal creation to track lifecycle

**File:** `src/components/project/projectPageEffects.ts` — `useUploadFile`

After dispatching `ADD_TRACK`, also call `TrackSignalStore.create(trackId)`. This ensures signals exist before any component tries to read them.

**File:** `src/components/workstation/workstationEffects.ts` — `useMicrophone`

Same treatment: call `TrackSignalStore.create(trackId)` after creating a recorded track.

### 2.3 Update Channel.tsx

**File:** `src/components/workstation/Channel.tsx`

- Import `TrackSignalStore` from `src/signals/trackSignals`
- Replace `throttledUpdateVolume` with a direct signal write:
  ```ts
  const updateVolume = (value: number) => {
    TrackSignalStore.get(trackId).volume.value = value;
    // Focus/unfocus still dispatches to workstation reducer (migrated in Phase 5)
    workstationDispatch([SET_TRACK_FOCUS, trackId]);
    debouncedUnfocusTrack();
  };
  ```
- Remove the `useThrottled` wrapper — signals don't need throttling since no React reconciliation runs
- Remove the `useEffect` that syncs `volume` to `audioChannel.volume` (the bridge handles this)
- Remove the `channelRef` usage for volume (mute/solo still uses it until Phase 3)

### 2.4 Update Waveform.tsx

**File:** `src/components/workstation/Waveform.tsx`

- Read opacity from the volume signal instead of `track.volume`:
  ```ts
  const volumeSignal = TrackSignalStore.get(trackId).volume;
  const opacity = (volumeSignal.value / 100).toFixed(2);
  ```
- Because `@preact/signals-react` integrates with React's rendering, reading `.value` in JSX subscribes the component to fine-grained updates — only the opacity style changes, not the entire waveform.

### 2.5 Remove SET_TRACK_VOLUME from the reducer

**File:** `src/components/project/projectPageReducer.ts`

- Remove the `SET_TRACK_VOLUME` action case
- Remove the `volume` field from the `Track` type
- Remove the `setTrackVolume` helper function
- Update `createTrack` to no longer set an initial volume (the signal handles this)

**File:** `src/components/workstation/Channel.tsx`

- Stop destructuring `volume` from `track`

### 2.6 Update tests

- Add unit tests for `TrackSignalStore.create()` / `dispose()` / signal reads
- Add a test for `useAudioBridge`: verify that updating a volume signal calls the audio channel's volume setter
- Update `Channel.test.tsx`: verify slider writes to signal instead of dispatching
- Update `Waveform.test.tsx`: verify opacity reads from signal

### Verification

- Volume slider still controls audio volume with no audible difference
- Moving the slider does **not** cause `Workstation`, `Timeline`, or `Scrubber` to re-render (verify with React DevTools profiler)
- `npm test` passes
- `npm run build` succeeds

---

## Phase 3: Mute/Solo Signals

**Goal:** Migrate per-track mute and solo from the reducer to signals, and replace the dual-layer mute computation with a computed signal.

### Current flow

```
Button click → projectDispatch([SET_TRACK_MUTE])
  → projectReducer creates new tracks[]
  → useMutedTracks effect fires (tracks changed)
  → audioService.mixer.getMutedChannels() computes which tracks are muted
  → workstationDispatch([SET_MUTED_TRACKS])
  → workstationReducer updates mutedTracks[]
  → Timeline re-renders with new CSS classes
```

### Target flow

```
Button click → trackSignals.get(id).mute.value = !current
  → signal effect() → audioChannel.mute = value
  → computed mutedTracks signal auto-updates
  → Timeline reads computed signal for CSS classes
```

### 3.1 Extend the audio bridge for mute/solo

**File:** `src/hooks/useAudioBridge.ts`

Add signal effects for each track's `mute` and `solo` signals:
- `effect(() => audioChannel.mute = trackSignals.get(id).mute.value)`
- `effect(() => audioChannel.solo = trackSignals.get(id).solo.value)`

### 3.2 Create the computed mutedTracks signal

**File:** `src/signals/trackSignals.ts`

Add a `computed()` signal that derives the list of muted track IDs from all per-track mute/solo signals. This replaces the `useMutedTracks` effect + `SET_MUTED_TRACKS` reducer action + `setMutedTracksOrBail` optimization.

```ts
import { computed } from '@preact/signals-react';

export const mutedTracks = computed(() => {
  const allIds = Array.from(store.keys());
  const hasSolo = allIds.some((id) => store.get(id)!.solo.value);
  return allIds.filter((id) => {
    const s = store.get(id)!;
    return s.mute.value || (hasSolo && !s.solo.value);
  });
});
```

The `setMutedTracksOrBail` shallow-equality optimization in the reducer is no longer needed — Preact Signals memoizes computed values automatically.

### 3.3 Update Channel.tsx

- Replace `updateMute` / `updateSolo` to write to signals instead of dispatching
- Remove the `useEffect` blocks that sync `mute` and `solo` to `channelRef.current`
- Remove `channelRef` entirely (all audio syncing is now in the bridge)

### 3.4 Update Timeline.tsx

- Import `mutedTracks` computed signal from `src/signals/trackSignals`
- Read `mutedTracks.value` instead of receiving `mutedTracks` as a prop
- Remove `mutedTracks` from `TimelineProps`

### 3.5 Update Workstation.tsx

- Remove `useMutedTracks(tracks, dispatch)` call
- Stop passing `mutedTracks` to `Timeline` and `Mixer`

### 3.6 Remove reducer actions

- Remove `SET_TRACK_MUTE`, `SET_TRACK_SOLO` from `projectPageReducer.ts`
- Remove `mute`, `solo` fields from `Track` type
- Remove `SET_MUTED_TRACKS` from `workstationReducer.ts`
- Remove `mutedTracks` from `WorkstationState`
- Remove `setMutedTracksOrBail` helper
- Remove `useMutedTracks` from `workstationEffects.ts`

### 3.7 Update Mixer.tsx

- Read `mutedTracks` from the computed signal instead of props
- Update the `isMuted` computation for each `Channel`

### 3.8 Update tests

- Test the `mutedTracks` computed signal: verify it correctly derives muted state from individual mute/solo signals
- Update `Channel.test.tsx`, `Timeline.test.tsx`, `Mixer.test.tsx`, `Workstation.test.tsx`

### Verification

- Mute/solo buttons work identically
- The dual-layer mute logic (solo overrides, multiple solos) behaves the same
- CSS classes on timeline waveforms update correctly
- `npm test` passes

---

## Phase 4: Transport & Playback Signals

**Goal:** Migrate transport time and playback state to signals. Clean up the `Scrubber` animation loop which currently mixes direct DOM manipulation with reducer dispatches.

### Current flow (playback)

```
Toolbar click → workstationDispatch([TOGGLE_PLAYBACK])
  → workstationReducer toggles isPlaying
  → usePlaybackControl effect fires
  → audioService.startPlayback() / pausePlayback()
```

```
During playback (animation loop in Scrubber):
  → requestAnimationFrame
  → audioService.getTransportTime()
  → direct DOM write: timelineScrollRef.scrollLeft = position
  → audioService.mixer.getLoudness()
  → direct DOM write: cursorRef.style.setProperty('--loudness', ...)
  → end-of-scroll check → dispatch([STOP_AND_REWIND_PLAYBACK])
```

```
User scrolls:
  → dispatch([STOP_PLAYBACK])
  → debounced dispatch([SET_TRANSPORT_TIME])
  → dispatch([START_PLAYBACK])
  → usePlaybackControl effect fires
  → audioService.startPlayback(time) or pausePlayback(time)
```

### Target flow

```
Toolbar click → isPlaying.value = !isPlaying.value
  → signal effect() → audioService.startPlayback() / pausePlayback()
```

```
During playback:
  → requestAnimationFrame
  → transportTime.value = audioService.getTransportTime()
  → signal effect() → DOM write: scrollLeft = position
  → loudness.value = mixer.getLoudness()
  → signal effect() → DOM write: style --loudness
```

```
User scrolls:
  → transportTime.value = scrollLeft / pixelsPerSecond
  → signal effect() → audioService.setTransportTime(time)
```

### 4.1 Create the transport bridge

**New file:** `src/hooks/useTransportBridge.ts`

Set up signal effects:
- Watch `isPlaying` signal → call `audioService.startPlayback()` / `pausePlayback()`
- Preserve the existing seek logic: only pass `transportTime` when it was explicitly changed by the user (not during normal playback progression)

### 4.2 Migrate the Scrubber animation loop

**File:** `src/components/workstation/Scrubber.tsx`

- Replace the `animateScrollCallback` + `useAnimation` pattern:
  - Instead, use a `requestAnimationFrame` loop that writes to `transportTime` and `loudness` signals
  - Signal effects handle DOM updates (scroll position, CSS custom property)
- Replace `dispatch([SET_TRANSPORT_TIME, ...])` in scroll handlers with `transportTime.value = ...`
- Replace `dispatch([STOP_PLAYBACK])` / `dispatch([START_PLAYBACK])` with signal writes
- Replace `dispatch([STOP_AND_REWIND_PLAYBACK])` with signal writes + `transportTime.value = 0`
- Replace `dispatch([TOGGLE_PLAYBACK])` on click with `isPlaying.value = !isPlaying.value`

### 4.3 Update Toolbar.tsx

- Replace playback dispatches with signal writes:
  - `TOGGLE_PLAYBACK` → `isPlaying.value = !isPlaying.value`
  - `TOGGLE_MIXER` stays as a reducer dispatch (low-frequency UI state)
  - `TOGGLE_RECORDING` stays as a reducer dispatch (triggers async side effects)

### 4.4 Update workstationEffects.ts

- Remove `usePlaybackControl` (replaced by transport bridge)
- Remove `useSpacebarPlaybackToggle` — rewrite as a signal-based keypress handler that sets `isPlaying.value`
- `useTotalTime` can write to a signal instead of dispatching, or remain as-is since it's low-frequency

### 4.5 Remove reducer actions

- Remove `SET_TRANSPORT_TIME`, `START_PLAYBACK`, `STOP_PLAYBACK`, `STOP_AND_REWIND_PLAYBACK`, `TOGGLE_PLAYBACK` from `workstationReducer.ts`
- Remove `isPlaying`, `transportTime` from `WorkstationState`

### 4.6 Remove useAnimation hook

If no other consumer remains after `Scrubber` migrates, remove `src/hooks/useAnimation.tsx`.

### 4.7 Update tests

- Test transport bridge: verify `isPlaying` signal changes trigger audio engine calls
- Test Scrubber: verify scroll → signal write → audio seek
- Test Toolbar: verify button clicks update signals

### Verification

- Playback starts/stops correctly
- Scrubber follows playback position smoothly
- User scroll-to-seek works (pause → scroll → resume)
- End-of-playback rewind works
- Spacebar toggle works
- Loudness meter animates on cursor
- `npm test` passes

---

## Phase 5: Track Focus Signals

**Goal:** Migrate `focusedTracks` from the workstation reducer to signals.

### 5.1 Update Channel.tsx

- Replace `workstationDispatch([SET_TRACK_FOCUS, trackId])` with `focusTrack(trackId)` from `src/signals/focusSignals`
- Replace `workstationDispatch([SET_TRACK_UNFOCUS, trackId])` with `unfocusTrack(trackId)`
- Remove the `useDebounced` wrapper for unfocus — handle debounce inside the signal helper if still needed

### 5.2 Update Timeline.tsx

- Read `focusedTracks.value` from the signal instead of props
- Remove `focusedTracks` from `TimelineProps`

### 5.3 Remove reducer actions

- Remove `SET_TRACK_FOCUS`, `SET_TRACK_UNFOCUS` from `workstationReducer.ts`
- Remove `focusedTracks` from `WorkstationState`

### 5.4 Update Workstation.tsx

- Stop passing `focusedTracks` to `Timeline`

### Verification

- Volume slider drag still highlights the active track in the timeline
- Highlight fades after releasing the slider
- `npm test` passes

---

## Phase 6: React Compiler Cleanup

**Goal:** Remove manual memoization that the React Compiler now handles automatically. This phase has no behavioral changes — it's pure code cleanup.

### 6.1 Remove React.memo wrappers

**File:** `src/components/workstation/Workstation.tsx`

Remove:
```ts
const MemoizedDropzone = React.memo(Dropzone);
const MemoizedEmptyTimeline = React.memo(EmptyTimeline);
const MemoizedMixer = React.memo(Mixer);
const MemoizedToolbar = React.memo(Toolbar);
```

Use the components directly in JSX.

**File:** `src/components/workstation/Timeline.tsx`

Remove:
```ts
const MemoizedSpectrogram = React.memo(Spectrogram);
const MemoizedWaveform = React.memo(Waveform);
```

### 6.2 Remove useMemo wrappers

**File:** `src/components/workstation/Workstation.tsx`

The `memoizedTimeline` and `memoizedScrubberTimeline` `useMemo` blocks can be replaced with inline JSX. The React Compiler determines memoization boundaries automatically.

### 6.3 Remove useCallback wrappers

**File:** `src/components/workstation/Scrubber.tsx`

The `useCallback` around `setScrollPosition` and `animateScrollCallback` can be replaced with plain functions if the compiler handles stability.

### 6.4 Clean up dependency array comments

Remove all comments of the form:
```ts
// audioService never changes, and can safely be omitted from dependencies
```

The React Compiler infers stable references — these comments are no longer necessary.

### 6.5 Review useThrottled / useDebounced usage

After Phases 2–5, the remaining consumers of `useThrottled` and `useDebounced` may be reduced. Remove unused hooks.

### Verification

- Profile with React DevTools to confirm the compiler produces equivalent (or better) memoization
- `npm test` passes
- `npm run build` succeeds with no compiler warnings

---

## Phase 7: Undo/Redo & Reducer Consolidation

**Goal:** Add undo/redo support for track-level actions (create, delete, move), introduce `DELETE_TRACK`, and consolidate the remaining reducer state. The two reducers stay separate — project state gains undo/redo history while workstation state remains a simple toggle store.

### Current Reducer State After Phases 2–6

**ProjectState** — owns the track list (the only undoable domain):

```ts
type ProjectState = {
  nextColorId: number;
  nextIndex: number;
  title: string;
  tracks: Track[];
};
```

Actions: `ADD_TRACK`, `MOVE_TRACK`.

**WorkstationState** — owns UI toggles (not undoable):

```ts
type WorkstationState = {
  isMixerOpen: boolean;
  isRecording: boolean;
};
```

Actions: `TOGGLE_MIXER`, `TOGGLE_RECORDING`.

### Why the Reducers Stay Separate

Undo/redo applies exclusively to project state (track list mutations). Workstation state contains ephemeral UI toggles (mixer open/close, recording on/off) that should never be undone. Merging the reducers would force the undo stack to either wrap the entire combined state — creating nonsensical undo behavior for toggles — or add conditional logic to exclude certain actions. Keeping them separate avoids this entirely: the undo/redo middleware wraps only the project dispatch.

### Design: Command-Based Undo Stack

Each undoable action is recorded as a command with forward and reverse operations. The undo stack sits **outside** the reducer state (so undoing doesn't also undo the undo history). A `useUndoReducer` hook wraps `useReducer` and returns the same `[state, dispatch]` interface plus `undo()` and `redo()` functions.

```
src/
├── hooks/
│   └── useUndoReducer.ts       ← NEW: generic undo/redo wrapper for useReducer
│
├── components/project/
│   ├── projectPageReducer.ts    # Add DELETE_TRACK; keep ADD_TRACK, MOVE_TRACK
│   ├── projectPageEffects.ts    # Update useUploadFile; add useDeleteTrack
│   └── useProjectReducer.tsx    # Switch from useReducer to useUndoReducer
```

### 7.1 Create the `useUndoReducer` hook

**New file:** `src/hooks/useUndoReducer.ts`

A generic hook that wraps `useReducer` with an undo/redo history stack. It is not specific to the project reducer — any reducer can use it.

```ts
type UndoCommand<A> = {
  forward: A;   // the action that was applied
  reverse: A;   // the action that reverses it
};

type UndoStack<A> = {
  past: UndoCommand<A>[];
  future: UndoCommand<A>[];
};
```

The hook intercepts dispatched actions. For each action, the caller provides a `reverseAction` function that computes the reverse action from the current state and the forward action. The hook:

1. Computes the reverse action **before** applying the forward action (so it captures pre-mutation state)
2. Pushes `{ forward, reverse }` onto `past`
3. Clears `future` (new action invalidates the redo branch)
4. Delegates to the underlying reducer

`undo()` pops from `past`, dispatches `reverse`, pushes to `future`.
`redo()` pops from `future`, dispatches `forward`, pushes to `past`.

The stack has a configurable max depth (default: 50) to bound memory usage.

```ts
function useUndoReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initialState: S,
  reverseAction: (state: S, action: A) => A | null,
): [S, (action: A) => void, { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }]
```

If `reverseAction` returns `null`, the action is not recorded in the undo stack (pass-through). This allows mixing undoable and non-undoable actions through the same dispatch.

### 7.2 Add `DELETE_TRACK` to the project reducer

**File:** `src/components/project/projectPageReducer.ts`

Add a `DELETE_TRACK` action:

```ts
export const DELETE_TRACK = 'DELETE_TRACK';

case DELETE_TRACK:
  return {
    ...state,
    tracks: state.tracks
      .filter((t) => t.trackId !== payload.trackId)
      .map((track, i) => ({ ...track, index: i })),
  };
```

The reducer remains a pure function — it only removes the track from the array and re-indexes. Side effects (audio channel disposal, signal disposal) happen in the effects layer.

### 7.3 Define reverse actions for the project reducer

**File:** `src/components/project/projectPageReducer.ts`

Export a `reverseProjectAction` function:

```ts
export function reverseProjectAction(
  state: ProjectState,
  [type, payload]: ProjectAction,
): ProjectAction | null {
  switch (type) {
    case ADD_TRACK:
      return [DELETE_TRACK, { trackId: payload.trackId }];

    case DELETE_TRACK: {
      const track = state.tracks.find((t) => t.trackId === payload.trackId);
      if (!track) return null;
      return [ADD_TRACK, {
        trackId: track.trackId,
        fileName: track.fileName,
        // Carry the full track snapshot so the reducer can restore it exactly
        restore: track,
      }];
    }

    case MOVE_TRACK:
      return [MOVE_TRACK, {
        fromIndex: payload.toIndex,
        toIndex: payload.fromIndex,
      }];

    default:
      return null;
  }
}
```

Update `ADD_TRACK` in the reducer to accept an optional `restore` field in the payload. When present, the track is restored as-is (preserving its original color and filename) instead of generating a new color and incrementing `nextIndex`:

```ts
case ADD_TRACK:
  if (payload.restore) {
    return {
      ...state,
      tracks: [...state.tracks, payload.restore],
    };
  }
  return {
    ...state,
    nextColorId: (state.nextColorId + 1) % COLOR_PALETTE.length,
    nextIndex: state.nextIndex + 1,
    tracks: [
      ...state.tracks,
      createTrack(state.nextIndex, state.nextColorId, payload),
    ],
  };
```

### 7.4 Coordinate side effects with undo/redo

Track mutations have side effects in two systems outside the reducer:
- **TrackSignalStore** — per-track volume/mute/solo signals
- **AudioService** — `Mixer` audio channels and `AudioSourceRepository` entries

These must be created and disposed in sync with the reducer state.

**Key principle:** The `AudioSourceRepository` (which holds decoded `AudioBuffer`s and blob URLs) is **never cleaned up** during undo/redo. Audio decoding is expensive and the buffers are needed to restore deleted tracks. The repository acts as a persistent cache for the lifetime of the session.

| Action | Signal Store | Mixer Channel | AudioSourceRepository |
|---|---|---|---|
| `ADD_TRACK` (new upload) | `create(id)` | `createChannel(id, buffer)` | `add(source)` — already done by `AudioService.createTrack()` |
| `ADD_TRACK` (undo-delete restore) | `create(id)` | `createChannel(id, buffer)` | No-op — entry already exists |
| `DELETE_TRACK` | `dispose(id)` | `deleteChannel(id)` | No-op — entry preserved |
| `MOVE_TRACK` / reverse | No-op | No-op | No-op |

**File:** `src/components/project/projectPageEffects.ts`

Add a `useTrackSideEffects` hook that reacts to state changes and syncs side effects:

```ts
export const useTrackSideEffects = (
  previousTracks: Track[],
  currentTracks: Track[],
) => {
  const audioService = useAudioService();

  useEffect(() => {
    const prevIds = new Set(previousTracks.map((t) => t.trackId));
    const currIds = new Set(currentTracks.map((t) => t.trackId));

    // Tracks added (new or restored via undo)
    for (const track of currentTracks) {
      if (!prevIds.has(track.trackId)) {
        if (!TrackSignalStore.get(track.trackId)) {
          TrackSignalStore.create(track.trackId);
        }
        if (!audioService.mixer.retrieveChannel(track.trackId)) {
          const buffer = audioService.retrieveAudioBuffer(track.trackId);
          if (buffer) {
            audioService.mixer.createChannel(track.trackId, buffer);
          }
        }
      }
    }

    // Tracks removed (deleted or removed via undo)
    for (const track of previousTracks) {
      if (!currIds.has(track.trackId)) {
        TrackSignalStore.dispose(track.trackId);
        audioService.mixer.deleteChannel(track.trackId);
      }
    }
  }, [currentTracks]);
};
```

This declarative approach means the effects layer doesn't need to know whether a track appeared because of a fresh upload, an undo, or a redo — it just diffs the track list and reconciles.

### 7.5 Wire up `useUndoReducer` in `useProjectReducer`

**File:** `src/components/project/useProjectReducer.tsx`

Replace `useReducer(projectReducer, initialState)` with:

```ts
const [state, dispatch, { undo, redo, canUndo, canRedo }] = useUndoReducer(
  projectReducer,
  initialState,
  reverseProjectAction,
);
```

Expose `undo`, `redo`, `canUndo`, `canRedo` through the existing project context so that `Toolbar` (or a future keyboard shortcut handler) can call them.

### 7.6 Add keyboard shortcuts for undo/redo

**File:** `src/components/workstation/workstationEffects.ts`

Add a `useUndoRedoKeyboard` hook:

```ts
export const useUndoRedoKeyboard = (
  undo: () => void,
  redo: () => void,
) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);
};
```

### 7.7 Add delete track UI

**File:** `src/components/workstation/Channel.tsx`

Add a delete button to each channel strip. On click:

```ts
projectDispatch([DELETE_TRACK, { trackId }]);
```

The side effects hook (7.4) handles signal disposal and audio channel cleanup automatically.

### 7.8 Clean up unused exports

Remove unused action constants, helper functions, and type fields across:
- `workstationReducer.ts` — verify no dead actions remain after Phases 2–6
- `workstationEffects.ts` — remove any orphaned helpers
- Component files — remove stale prop types and imports

### 7.9 Update tests

**Unit tests:**
- `useUndoReducer`: test undo/redo with a trivial counter reducer; test stack depth limit; test that `null` reverse actions are pass-through; test that new actions clear the redo branch
- `projectPageReducer`: test `DELETE_TRACK`; test `ADD_TRACK` with `restore` payload; test `reverseProjectAction` for all three action types
- `useTrackSideEffects`: test that adding a track creates signals + audio channel; test that removing a track disposes signals + deletes channel; test that `AudioSourceRepository` entries survive deletion

**Integration tests:**
- Upload a track → undo → verify track is removed from the timeline and audio is stopped → redo → verify track reappears with same color and filename
- Upload two tracks → delete second → undo delete → verify both tracks present → redo delete → verify second track gone
- Move track → undo → verify original order → redo → verify moved order
- Verify undo/redo keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z)

### Verification

- Full app functionality regression test
- Undo/redo works for create, delete, and move track actions
- Audio channels are correctly created/disposed on undo/redo (no orphaned Tone.js nodes, no missing playback)
- Signal store stays in sync with the track list (volume/mute/solo controls work after undo/redo)
- `AudioSourceRepository` entries persist across undo/redo cycles (no re-decoding)
- Undo stack respects max depth
- `npm test` passes
- `npm run build` succeeds

---

## Phase 8: Future Enhancements (Out of Scope)

These items from the Gemini discussion are new capabilities rather than migration steps. They can be pursued independently after the signal architecture is in place.

### AudioWorklets for off-thread DSP

- Create `src/audio/worklets/` directory
- Move waveform analysis to an `AudioWorkletProcessor`
- Requires the COOP/COEP headers from Phase 1.3

### Essentia.js for AI feature extraction

- Add `essentia.js` dependency
- Create `src/audio/essentia/analysis.service.ts`
- Load Wasm binary from `public/essentia-wasm.wasm`
- Integrate with signals for reactive analysis results

### Service layer reorganization

- Rename `src/services/` → `src/audio/`
- Restructure into `src/audio/engine.ts`, `src/audio/nodes/`, etc.
- This is a structural change that can happen at any time

---

## Migration Order Summary

```
Phase 1: Foundation                    (no behavior change)
  ↓
Phase 2: Volume Signals                (biggest perf win)
  ↓
Phase 3: Mute/Solo Signals             (removes dual-layer mute complexity)
  ↓
Phase 4: Transport & Playback Signals  (cleans up Scrubber animation)
  ↓
Phase 5: Track Focus Signals           (small, mechanical change)
  ↓
Phase 6: React Compiler Cleanup        (code quality, no behavior change)
  ↓
Phase 7: Undo/Redo & Reducer Consolidation (delete track, undo/redo, cleanup)
```

Each phase results in a deployable state. Phases 2–5 can be reordered if needed, but the listed order prioritizes by impact (highest first) and builds on the infrastructure from earlier phases.

## Risk Mitigation

- **`@preact/signals-react` + React 19 compatibility:** Verify during Phase 1 that the library initializes correctly with the React version in use. If integration issues arise, evaluate `@preact/signals-react-transform` as an alternative babel plugin approach.
- **React Compiler maturity:** The compiler is configured in Phase 1 but not relied upon until Phase 6. If it produces incorrect memoization, it can be disabled without affecting the signal migration.
- **COEP header breaking external resources:** The Cross-Origin Isolation headers in Phase 1.3 may block Ant Design's CDN font loading or other external resources. Test in isolation; defer if problematic.
- **Test mocking:** `@preact/signals-react` may require updates to the test setup (signal resets between tests). Address in Phase 1.5 before any behavioral changes.
