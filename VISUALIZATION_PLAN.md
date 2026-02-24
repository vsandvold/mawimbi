# Mawimbi Spectrogram Visualization Plan

## Design Decisions (Settled)

- **Spectrogram only** — no waveforms. WaveSurfer.js removed entirely.
- **Per-track spectrograms** — each track gets its own canvas with its `TrackColor`.
- **Layered with transparency** — tracks stacked in a CSS Grid cell (existing pattern). Focus/mute/solo controls `z-index` and `opacity`. Drag-and-drop reordering preserved.
- **Custom rendering** — no WaveSurfer spectrogram plugin. All canvas drawing is ours.
- **Auto-scrolling timeline** — playhead fixed at 75% viewport. Timeline scrolls underneath (existing `Scrubber` behaviour).
- **Long audio** — tiled canvas architecture to handle 10+ minute recordings.
- **Live overlay** — during playback, real-time FFT data draws additively on top of static spectrogram.

---

## Architecture

```
AudioBuffer ──→ OfflineAnalyser.analyseToFrames() ──→ SpectrogramData
                                                            │
                                                            ▼
                                                   SpectrogramTileRenderer
                                                   (color map + OffscreenCanvas)
                                                            │
                                                            ▼
                                                      ImageBitmap[]
                                                   (cached per track)
                                                            │
                                                            ▼
                                              Spectrogram component canvas
                                              (draws visible tiles only,
                                               scales for zoom via drawImage)
```

During playback, a `Tone.Analyser` per channel provides live FFT data that is drawn additively at the current transport position.

### Tiling

Each track's frequency data is rendered to fixed-width `OffscreenCanvas` tiles (4096px each), captured as `ImageBitmap`. At 200 px/sec, a 10-minute file = 120,000px = ~30 tiles. Only tiles intersecting the viewport are drawn each frame. The on-screen canvas is viewport-sized (not full-timeline-sized), avoiding browser canvas limits entirely.

### Zoom

Tiles are rendered at native resolution (1px per FFT time step). Zoom is applied via `drawImage` scaling — no re-analysis needed. The scale factor is `pixelsPerSecond / nativePixelsPerSecond`.

---

## Alternative Considered: Live Canvas (Not Pursued)

An alternative to the tiled `ImageBitmap` approach is a "live canvas" where no pre-rendered tiles exist. Instead, each track has a viewport-sized canvas that repaints every visible FFT frame from raw `SpectrogramData` on every animation frame.

**How it would work:** `OfflineAnalyser.analyseToFrames()` still runs on upload, but the `Uint8Array[]` frequency frames stay as raw data — no `SpectrogramTileRenderer`, no `ImageBitmap` cache. On each animation frame, the component computes which frames fall within the visible viewport and draws them with `fillRect`. During playback, the live `Tone.Analyser` data replaces the stored frame at the playhead. During recording, new frames append to the array. It's all one drawing loop — no distinction between static and live rendering.

**Why it's appealing:** Simpler architecture (roughly 3 fewer files — no tile renderer, no tile cache, no `OffscreenCanvas`/`ImageBitmap` API surface). Live and static rendering are unified into one code path. Effects are trivial because the analyser data naturally reflects the wet signal. No cache invalidation logic.

**Why we're not doing it:** The per-frame rendering cost is prohibitive. At typical zoom, the viewport shows ~1000+ FFT frames. Each frame has 2048 frequency bins drawn with `fillRect`. That's ~2 million `fillRect` calls per frame per track. At 60fps with multiple tracks, this breaks down — especially during user-initiated scroll (swiping), where the viewport can jump large distances and the entire visible region must be repainted immediately. The tiled approach reduces per-frame cost to 2–3 `drawImage` calls (GPU-accelerated blits of pre-rendered bitmaps), making both smooth scrolling and playback essentially free regardless of track count or file length.

**Migration path:** The `SpectrogramData` format is shared between both approaches. If the tiled approach proves over-engineered for some use case, switching to live canvas rendering only requires changing the rendering layer — the analysis pipeline and data format remain the same.

---

## Implementation Phases

Each phase produces a deployable state. No phase leaves the app broken.

---

### Phase 1: Extract `SpectrogramCanvasRenderer` to its own file

**What:** Move the `SpectrogramCanvasRenderer` class from `Spectrogram.tsx` into `src/services/SpectrogramCanvasRenderer.ts`. No behaviour change.

**Why this is separate:** It's a pure refactor that makes the renderer testable and reusable. The next phases depend on it.

**Files changed:**
- `src/components/workstation/Spectrogram.tsx` — remove class, add import
- `src/services/SpectrogramCanvasRenderer.ts` — new file, class moved here

**Tests:** Existing `Spectrogram.test.tsx` continues to pass unchanged. Optionally add unit tests for `SpectrogramCanvasRenderer.drawSpectrogramFrame()`.

**Deployable state:** App works identically to before.

---

### Phase 2: Add `analyseToFrames()` to `OfflineAnalyser`

**What:** Add a new method to `OfflineAnalyser` that returns structured frequency data instead of streaming through a callback. The existing `getFrequencyData` / `getLogarithmicFrequencyData` methods remain unchanged.

```typescript
// New type
type SpectrogramData = {
  frequencyFrames: Uint8Array[];  // one Uint8Array per FFT time step (copied)
  timeResolution: number;
  frequencyBinCount: number;
  sampleRate: number;
  duration: number;
};

// New method on OfflineAnalyser
async analyseToFrames(): Promise<SpectrogramData> {
  const frames: Uint8Array[] = [];
  // Note: creates a NEW OfflineAudioContext internally each time,
  // because OfflineAudioContext can only render once.
  // The existing constructor creates one context; this method
  // must create a fresh one for the analysis pass.
  // ... collect frames, return structured data
}
```

**Important implementation detail:** `OfflineAudioContext` can only call `startRendering()` once. The current `OfflineAnalyser` constructor creates the context, and the first call to `getFrequencyData` consumes it. The new `analyseToFrames()` must create its own `OfflineAudioContext` internally. This means the analyser becomes multi-use: you can call `analyseToFrames()` independently of the existing `getFrequencyData`.

**Files changed:**
- `src/services/OfflineAnalyser.ts` — add `analyseToFrames()` method and `SpectrogramData` type export

**Tests:** Add tests for `analyseToFrames()` in `OfflineAnalyser.test.ts`. Existing tests pass unchanged.

**Deployable state:** App works identically. New method is unused until Phase 4.

---

### Phase 3: Create `SpectrogramTileRenderer`

**What:** A pure function that takes `SpectrogramData` + `TrackColor` and produces `ImageBitmap[]`. Uses `OffscreenCanvas` internally. No DOM access, no side effects.

```typescript
// src/services/SpectrogramTileRenderer.ts
export function renderTiles(
  data: SpectrogramData,
  color: TrackColor,
  tileWidth: number,  // default 4096
): ImageBitmap[]
```

Reuses the color map logic from the extracted `SpectrogramCanvasRenderer` (Phase 1). Each tile is an `OffscreenCanvas` rendered with `fillRect` per bin, then captured via `transferToImageBitmap()`.

**Files created:**
- `src/services/SpectrogramTileRenderer.ts`

**Tests:** Unit tests with a small synthetic `SpectrogramData` (e.g. 10 frames × 8 bins). Verify correct number of tiles, correct dimensions. Use `OffscreenCanvas` in test environment (jsdom may need polyfill or tests run in a real browser context via Playwright).

**Deployable state:** App works identically. New function is unused until Phase 4.

---

### Phase 4: Create `SpectrogramCache` service

**What:** A cache that owns per-track `SpectrogramData` and `ImageBitmap[]`. Wired into `AudioService`.

```typescript
// src/services/SpectrogramCache.ts
class SpectrogramCache {
  async analyse(trackId: string, audioBuffer: AudioBuffer, color: TrackColor): Promise<void>
  getEntry(trackId: string): TrackSpectrogramEntry | undefined
  invalidate(trackId: string): void
  invalidateAll(): void
}
```

Internally uses `OfflineAnalyser.analyseToFrames()` (Phase 2) and `renderTiles()` (Phase 3).

**Files changed:**
- `src/services/SpectrogramCache.ts` — new
- `src/services/AudioService.ts` — add `spectrogramCache: SpectrogramCache` property, initialize in constructor

**Tests:** Unit tests for cache lifecycle (analyse → getEntry → invalidate → getEntry returns undefined).

**Deployable state:** App works identically. `SpectrogramCache` exists on `AudioService` but nothing reads from it yet.

---

### Phase 5: Rewrite `Spectrogram.tsx` with tiled viewport rendering

**What:** Replace the current `Spectrogram` component. The new version:

1. On mount, calls `audioService.spectrogramCache.analyse(trackId, audioBuffer, color)` if not already cached.
2. Renders a single `<canvas>` sized to the **viewport width** (not full timeline width).
3. On each animation frame, computes the visible scroll region from `transportTime.value * pixelsPerSecond`, determines which tiles intersect, draws them with zoom-scaled `drawImage`.
4. The `useTrackVolume` hook still controls `opacity` on the container div.

The canvas is positioned absolutely within the grid cell. Because it's viewport-sized and draws the correct tiles for the current scroll position, it appears to scroll with the timeline even though it's actually being redrawn each frame.

**Scroll sync approach:** The `Spectrogram` component reads `transportTime` (signal, already updated every frame by `Scrubber.tsx` during playback) and `pixelsPerSecond` to compute which tiles to draw. For user-initiated scroll (not playing), the Scrubber already writes to `transportTime` via the debounced scroll handler. The spectrogram picks this up.

**Files changed:**
- `src/components/workstation/Spectrogram.tsx` — full rewrite
- `src/components/workstation/Spectrogram.css` — update for viewport-sized canvas

**Files created:**
- `src/hooks/useAnimationFrame.ts` — clean `requestAnimationFrame` hook with auto-cleanup

**Tests:** Update `Spectrogram.test.tsx`. Test that canvas renders, opacity from volume still works, `spectrogramCache.analyse` is called when buffer exists.

**Deployable state:** Spectrograms now render from tiled cache. Zoom is fast (no re-analysis). Long files work. The old callback-based rendering path is gone. **This is a visible behaviour change** — spectrograms may look slightly different due to the tiled/scaled rendering vs. the old direct-draw approach. Verify visually.

---

### Phase 6: Remove `Waveform.tsx` and WaveSurfer.js

**What:** Remove the waveform code path from `Timeline.tsx`. Remove all WaveSurfer.js-related code.

**Files changed:**
- `src/components/workstation/Timeline.tsx` — remove `useBrowserSupport` import, remove `browserSupport` usage, remove `Waveform` import, always render `Spectrogram`
- `src/components/workstation/Waveform.tsx` — delete
- `src/components/workstation/__tests__/Waveform.test.tsx` — delete
- `src/setupTests.ts` — remove `vi.mock('wavesurfer.js', ...)` block
- `e2e/audio.spec.ts` — update comment on line 196 that references WaveSurfer
- `package.json` — remove `wavesurfer.js` dependency

**Not changed:**
- `src/browserSupport.tsx` — stays (still used for `touchEvents` in `Fullscreen.tsx` and `EmptyTimeline.tsx`)
- `src/services/AudioService.ts` — `retrieveBlobUrl()` method stays for now (it's part of the public API, other consumers may use it; can be cleaned up separately)

**Tests:** Remove `Waveform.test.tsx`. Update `Timeline` tests if any reference waveform. Run full test suite.

**Deployable state:** App shows spectrograms for all tracks on all browsers. The `webkitOfflineAudioContext` browser-capability branching is gone. WaveSurfer.js is no longer a dependency.

---

### Phase 7: Add `Tone.Analyser` per channel in `Mixer`

**What:** Insert a `Tone.Analyser` into each channel's signal chain. Expose `getFrequencyData(trackId)`.

Current signal chain:
```
Player → Channel → Destination
```

New signal chain:
```
Player → Channel → Analyser → Destination
```

Note: `Channel.toDestination()` is currently called in `createChannel`. This must change to manual routing so the analyser sits between channel and destination:

```typescript
const analyser = new Tone.Analyser({ type: 'fft', size: 2048 });
player.chain(channel, analyser, Tone.getDestination());
// Do NOT call channel.toDestination() anymore
```

The `AudioChannel` class gets a reference to the analyser so it can be disposed with the channel.

**Files changed:**
- `src/services/Mixer.ts` — add `Tone.Analyser` creation in `createChannel`, store in `AudioChannel`, add `getFrequencyData(trackId)` method, update `AudioChannel.dispose()` to also dispose the analyser

**Tests:** Update `Mixer.test.ts`. Verify that `getFrequencyData` returns data (or `undefined` for unknown track).

**Deployable state:** App works identically — the analyser is in the chain but nothing reads from it yet. Audio routing is unchanged (same nodes, just an extra analyser in the path). Verify that audio still plays correctly and the existing `Tone.Meter` (connected to `Tone.getDestination()`) still reports loudness.

---

### Phase 8: Live playback spectrogram overlay

**What:** During playback, the `Spectrogram` component reads live FFT data from `Mixer.getFrequencyData(trackId)` and draws it additively on top of the static tiles.

Implementation approach:
- In the existing rAF loop (from Phase 5), after drawing static tiles, check `isPlaying.value`
- If playing, call `audioService.mixer.getFrequencyData(trackId)`
- Draw the FFT data as a single column at the current transport time position
- Use the track's `TrackColor` with the same color map as the static spectrogram
- The column is drawn with additive compositing (`globalCompositeOperation = 'lighter'` or simply higher alpha) so it appears brighter than the static data underneath

The live data is ephemeral — it's drawn each frame and gone the next. It doesn't modify the cached tiles.

**Files changed:**
- `src/components/workstation/Spectrogram.tsx` — extend rAF loop to draw live FFT overlay

**Tests:** Test that during playback (mock `isPlaying.value = true`), `getFrequencyData` is called.

**Deployable state:** During playback, a bright column follows the playhead showing the current frequency content of each track, including any effects in the signal chain.

---

### Phase 9: Add `Tone.Analyser` to `MicrophoneUserMedia`

**What:** Add a `Tone.Analyser` to the microphone signal path. Expose `getFrequencyData()`.

Current mic routing:
```
UserMedia → Meter
```

New routing:
```
UserMedia → Meter
UserMedia → Analyser
```

Both `Meter` and `Analyser` connect directly to the `UserMedia` output (fan-out). The analyser doesn't need to be in the recording path — it just observes the signal.

```typescript
constructor() {
  this.meter = new Tone.Meter();
  this.analyser = new Tone.Analyser({ type: 'fft', size: 2048 });
  this.microphone = new Tone.UserMedia()
    .connect(this.meter)
    .connect(this.analyser);
}

getFrequencyData(): Float32Array {
  return this.analyser.getValue() as Float32Array;
}
```

**Files changed:**
- `src/services/MicrophoneUserMedia.ts` — add `Tone.Analyser`, add `getFrequencyData()`

**Tests:** Unit test that `getFrequencyData` returns a `Float32Array`.

**Deployable state:** App works identically. Mic analyser exists but nothing reads from it yet.

---

### Phase 10: Recording spectrogram

**What:** During recording, the `Spectrogram` component for the recording track draws live frequency data from the microphone analyser, growing from the recording start time.

Implementation:
- When `isRecording.value` is true, the spectrogram component for the new (recording) track reads `audioService.microphone.getFrequencyData()` in its rAF loop
- Draws columns starting at `recordingStartTime * pixelsPerSecond` and advancing with `transportTime`
- These columns accumulate on an internal recording canvas/buffer (not the tile cache — the recording hasn't finished yet)
- When recording stops and the track is finalized (existing `useMicrophone` hook in `workstationEffects.ts`), `SpectrogramCache.analyse()` runs on the resulting `AudioBuffer` and replaces the live recording data with proper cached tiles

This phase requires the `Spectrogram` component to handle a "recording mode" where there's no cached data yet and the data source is the mic analyser rather than the mixer analyser.

**Files changed:**
- `src/components/workstation/Spectrogram.tsx` — add recording mode rendering

**Tests:** Test recording mode drawing path.

**Deployable state:** Users see a growing spectrogram while recording. After recording stops, it seamlessly transitions to the cached static spectrogram.

---

### Phase 11: Worker offloading for offline analysis

**What:** Move the offline FFT analysis and tile rendering to a Web Worker so large file uploads don't freeze the UI.

Implementation:
- Create `src/services/spectrogram.worker.ts`
- The worker receives `AudioBuffer` channel data (transferred, not copied) via `postMessage`
- The worker creates its own `OfflineAudioContext`, runs the FFT analysis, renders tiles with `SpectrogramTileRenderer`
- The worker returns `ImageBitmap[]` via `postMessage` with transfer (zero-copy since `ImageBitmap` is transferable)
- `SpectrogramCache.analyse()` becomes async (it already returns a Promise) and delegates to the worker

This does NOT require `SharedArrayBuffer` or `Cross-Origin-Isolation` headers. It uses standard `postMessage` with transferable objects.

**Files created:**
- `src/services/spectrogram.worker.ts`

**Files changed:**
- `src/services/SpectrogramCache.ts` — delegate analysis to worker

**Tests:** Test that analysis completes and produces valid tiles (may require worker-compatible test setup).

**Deployable state:** Large file uploads complete without UI jank. Multiple tracks can be analysed in parallel.

---

## Files Summary

### New files (in creation order)
| Phase | File | Purpose |
|---|---|---|
| 1 | `src/services/SpectrogramCanvasRenderer.ts` | Extracted renderer class |
| 2 | (type export from `OfflineAnalyser.ts`) | `SpectrogramData` type |
| 3 | `src/services/SpectrogramTileRenderer.ts` | Frequency data + color → `ImageBitmap[]` |
| 4 | `src/services/SpectrogramCache.ts` | Per-track tile cache |
| 5 | `src/hooks/useAnimationFrame.ts` | rAF hook with cleanup |
| 11 | `src/services/spectrogram.worker.ts` | Off-thread analysis |

### Modified files
| Phase | File | Change |
|---|---|---|
| 1 | `Spectrogram.tsx` | Remove renderer class |
| 2 | `OfflineAnalyser.ts` | Add `analyseToFrames()` |
| 4 | `AudioService.ts` | Add `spectrogramCache` property |
| 5 | `Spectrogram.tsx` | Full rewrite (tiled viewport rendering) |
| 5 | `Spectrogram.css` | Viewport-sized canvas |
| 6 | `Timeline.tsx` | Remove waveform branch |
| 6 | `package.json` | Remove `wavesurfer.js` |
| 6 | `setupTests.ts` | Remove wavesurfer mock |
| 7 | `Mixer.ts` | Add `Tone.Analyser` per channel |
| 8 | `Spectrogram.tsx` | Add live playback overlay |
| 9 | `MicrophoneUserMedia.ts` | Add `Tone.Analyser` |
| 10 | `Spectrogram.tsx` | Add recording mode |
| 11 | `SpectrogramCache.ts` | Delegate to worker |

### Deleted files
| Phase | File |
|---|---|
| 6 | `Waveform.tsx` |
| 6 | `Waveform.test.tsx` |

### Unchanged files
`Scrubber.tsx`, `Mixer.tsx` (UI), `Channel.tsx`, `Toolbar.tsx`, `projectPageReducer.ts`, all signal files, `browserSupport.tsx` (still used for `touchEvents`), `Workstation.tsx`, all hooks except new `useAnimationFrame`.

---

## Open Questions (Low Priority)

1. **Tile resolution mipmapping:** Start with single native resolution. Add 2–3 mipmap levels later if zoom quality is insufficient.

2. **Effects invalidation policy:** When effects are added (future feature), should `SpectrogramCache.invalidate(trackId)` run immediately on parameter change, on next play, or on explicit user action? Defer this decision until effects are implemented.

3. **Memory profiling:** After Phase 5 is deployed, profile GPU memory usage with 5+ tracks of 10-minute audio to validate the `ImageBitmap` tile approach scales.

4. **Fade/opacity during live drawing:** Currently `useTrackVolume` sets `opacity` on the container div, which affects both static tiles and live overlay equally. This is probably correct but worth verifying visually.
