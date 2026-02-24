# Mawimbi Visualization Improvement Plan

## Unified Incremental Implementation Guide

This plan synthesises the **VISUALIZATION_PLAN.md** (concrete phased implementation) and **audio-visualization-research.md** (architectural research and rationale) into a single coherent, incrementally deployable plan. Each step produces a working, deployable state.

---

## Design Principles

- **Spectrogram only** — no waveforms. WaveSurfer.js will be removed.
- **Per-track spectrograms** — each track gets its own canvas rendered with its `TrackColor`.
- **Layered with transparency** — tracks stacked in a CSS Grid cell. Focus/mute/solo controls `z-index` and `opacity`.
- **Tiled rendering** — pre-rendered `ImageBitmap` tiles for efficient zoom/scroll. Viewport-sized canvas draws only visible tiles.
- **Dual pipeline** — offline analysis for uploaded files; real-time `Tone.Analyser` for live playback and recording.
- **Off-main-thread processing** — Web Workers for FFT computation and tile rendering to eliminate UI jank.
- **Canvas 2D** — simpler than WebGL, supports `OffscreenCanvas` in workers. WebGL upgrade path preserved by the tile architecture.

---

## Architecture Overview

```
                         OFFLINE PIPELINE                    REAL-TIME PIPELINE
                         ──────────────                      ──────────────────
AudioBuffer ──→ Web Worker (FFT) ──→ SpectrogramData         Tone.Analyser
                                           │                      │
                                           ▼                      │
                                  SpectrogramTileRenderer          │
                                  (color map + OffscreenCanvas)    │
                                           │                      │
                                           ▼                      │
                                     ImageBitmap[]                │
                                     (cached per track)           │
                                           │                      │
                                           ▼                      ▼
                                    ┌────────────────────────────────┐
                                    │    Canvas Compositor (per track) │
                                    │    - draws visible tiles         │
                                    │    - overlays live FFT column    │
                                    └────────────────────────────────┘
```

### Tiling Strategy

Each track's frequency data is rendered to fixed-width `OffscreenCanvas` tiles (4096px). At 200 px/sec, a 10-minute file ≈ 30 tiles. Only tiles intersecting the viewport are drawn each frame. The on-screen canvas is viewport-sized, avoiding browser canvas limits. Zoom is applied via `drawImage` scaling — no re-analysis needed.

### Why Tiled ImageBitmaps Over Live Canvas

A "live canvas" approach (repaint all visible FFT frames every animation frame) was considered and rejected. At typical zoom the viewport shows ~1000+ FFT frames × 2048 frequency bins = ~2 million `fillRect` calls per frame per track. The tiled approach reduces this to 2–3 GPU-accelerated `drawImage` blits per frame, making smooth scrolling and playback performant regardless of track count or file length.

The `SpectrogramData` format is shared between both approaches, preserving a migration path if needed.

---

## Incremental Implementation Steps

Each step is independently deployable. No step leaves the app broken.

---

### Step 1: Extract `SpectrogramCanvasRenderer`

**Goal:** Pure refactor — make the renderer testable and reusable.

**What:** Move the `SpectrogramCanvasRenderer` class from `Spectrogram.tsx` into its own file. Extract colour map logic into a reusable form (this becomes the foundation for `ColorMap` utilities later).

**Files changed:**
- `src/components/workstation/Spectrogram.tsx` — remove class, add import
- `src/services/SpectrogramCanvasRenderer.ts` — new file

**Verification:** Existing `Spectrogram.test.tsx` passes unchanged. App identical.

---

### Step 2: Add `analyseToFrames()` to `OfflineAnalyser`

**Goal:** Produce structured frequency data suitable for the tile pipeline, without breaking the existing rendering.

**What:** Add a new method returning `SpectrogramData` — a structured representation of the full spectrogram.

```typescript
type SpectrogramData = {
  frequencyFrames: Uint8Array[];  // one per FFT time step (copied)
  timeResolution: number;
  frequencyBinCount: number;
  sampleRate: number;
  duration: number;
};
```

**Implementation note:** `OfflineAudioContext` can only `startRendering()` once. The new method creates its own fresh `OfflineAudioContext` internally, making the analyser multi-use.

**Files changed:**
- `src/services/OfflineAnalyser.ts` — add method and type export

**Verification:** New unit tests for `analyseToFrames()`. Existing tests pass. Method is unused until Step 5.

---

### Step 3: Create `SpectrogramTileRenderer`

**Goal:** A pure function that converts frequency data + track colour into renderable tiles.

**What:** Takes `SpectrogramData` + `TrackColor` and produces `ImageBitmap[]` using `OffscreenCanvas`. Uses `ImageData` batch painting (pixel-level writes via `putImageData`) instead of individual `fillRect` calls — this is 10–50x faster.

```typescript
export function renderTiles(
  data: SpectrogramData,
  color: TrackColor,
  tileWidth: number,  // default 4096
): ImageBitmap[]
```

**Files created:**
- `src/services/SpectrogramTileRenderer.ts`

**Verification:** Unit tests with synthetic data (e.g. 10 frames × 8 bins). Verify correct tile count and dimensions. App unchanged — function is unused until Step 5.

---

### Step 4: Create `SpectrogramCache` service

**Goal:** Wire the analysis and tile rendering into a cache accessible from components.

**What:** A cache owning per-track `SpectrogramData` and `ImageBitmap[]`, integrated into `AudioService`.

```typescript
class SpectrogramCache {
  async analyse(trackId: string, audioBuffer: AudioBuffer, color: TrackColor): Promise<void>
  getEntry(trackId: string): TrackSpectrogramEntry | undefined
  invalidate(trackId: string): void
  invalidateAll(): void
}
```

Internally uses `OfflineAnalyser.analyseToFrames()` (Step 2) and `renderTiles()` (Step 3).

**Files changed:**
- `src/services/SpectrogramCache.ts` — new
- `src/services/AudioService.ts` — add `spectrogramCache` property

**Verification:** Unit tests for cache lifecycle. App unchanged — cache exists but nothing reads from it yet.

---

### Step 5: Rewrite `Spectrogram.tsx` with tiled viewport rendering

**Goal:** Replace the current component with the tile-based renderer. **This is the first visible change.**

**What:** The new component:
1. On mount, calls `spectrogramCache.analyse()` if not already cached.
2. Renders a single `<canvas>` sized to the **viewport** (not full timeline).
3. On each animation frame, computes the visible scroll region from `transportTime * pixelsPerSecond`, determines which tiles intersect, draws them with zoom-scaled `drawImage`.

**Scroll sync:** Reads `transportTime` (signal, updated every frame by `Scrubber.tsx`) and `pixelsPerSecond`. For user-initiated scroll, `Scrubber` already writes to `transportTime` via the debounced scroll handler.

**Files changed:**
- `src/components/workstation/Spectrogram.tsx` — full rewrite
- `src/components/workstation/Spectrogram.css` — viewport-sized canvas

**Files created:**
- `src/hooks/useAnimationFrame.ts` — clean `requestAnimationFrame` hook with auto-cleanup

**Verification:** Spectrograms render from tiled cache. Zoom works without re-analysis. Long files work. Verify visually — rendering may look slightly different from the old direct-draw approach.

---

### Step 6: Remove `Waveform.tsx` and WaveSurfer.js

**Goal:** Clean up the now-obsolete waveform code path.

**What:** Remove `Waveform.tsx`, its tests, and the `wavesurfer.js` dependency. Update `Timeline.tsx` to always render `Spectrogram`.

**Files changed:**
- `src/components/workstation/Timeline.tsx` — remove `Waveform` branch and `useBrowserSupport` usage
- `src/setupTests.ts` — remove `vi.mock('wavesurfer.js', ...)` block
- `e2e/audio.spec.ts` — update WaveSurfer reference comments
- `package.json` — remove `wavesurfer.js`

**Files deleted:**
- `src/components/workstation/Waveform.tsx`
- `src/components/workstation/__tests__/Waveform.test.tsx`

**Not changed:** `browserSupport.tsx` stays (still used for `touchEvents` elsewhere). `AudioService.retrieveBlobUrl()` stays (clean up separately).

**Verification:** All browsers show spectrograms. WaveSurfer.js is gone as a dependency.

---

### Step 7: Add `Tone.Analyser` per channel in `Mixer`

**Goal:** Insert real-time analysers into the audio graph, preparing for live visualisation.

**What:** Modify the signal chain from `Player → Channel → Destination` to `Player → Channel → Analyser → Destination`. This requires switching from `channel.toDestination()` to explicit routing via `.chain()`.

```typescript
const analyser = new Tone.Analyser({ type: 'fft', size: 2048, smoothing: 0 });
player.chain(channel, analyser, Tone.getDestination());
```

Expose `getFrequencyData(trackId)` on `Mixer`. The analyser is stored on `AudioChannel` and disposed with it.

**Note on smoothing:** Set `smoothingTimeConstant` to 0 for accurate per-frame spectrogram data (no temporal averaging).

**Files changed:**
- `src/services/Mixer.ts` — add analyser creation, storage, and `getFrequencyData()` method

**Verification:** Audio still plays correctly. Existing `Tone.Meter` still reports loudness. `getFrequencyData` returns data. App visually unchanged.

---

### Step 8: Live playback spectrogram overlay

**Goal:** During playback, show a bright column at the playhead reflecting live (post-effects) frequency content.

**What:** Extend the `Spectrogram` rAF loop: after drawing static tiles, check `isPlaying`. If playing, read live FFT from `Mixer.getFrequencyData(trackId)` and draw a single column at the current transport position using the track's colour map with additive compositing (`globalCompositeOperation = 'lighter'` or higher alpha).

The live data is ephemeral — drawn each frame, gone the next. It does not modify cached tiles.

**Files changed:**
- `src/components/workstation/Spectrogram.tsx` — extend rAF loop

**Verification:** During playback, a bright column follows the playhead. The overlay naturally reflects any future effects in the signal chain.

---

### Step 9: Add `Tone.Analyser` to `MicrophoneUserMedia`

**Goal:** Prepare for recording visualisation.

**What:** Add a `Tone.Analyser` to the microphone signal path (fan-out — both `Meter` and `Analyser` connect to `UserMedia` output). Expose `getFrequencyData()`.

```typescript
constructor() {
  this.meter = new Tone.Meter();
  this.analyser = new Tone.Analyser({ type: 'fft', size: 2048 });
  this.microphone = new Tone.UserMedia()
    .connect(this.meter)
    .connect(this.analyser);
}
```

**Files changed:**
- `src/services/MicrophoneUserMedia.ts`

**Verification:** App unchanged. Analyser exists but nothing reads from it yet.

---

### Step 10: Recording spectrogram

**Goal:** Paint a growing spectrogram in real time during recording.

**What:** When `isRecording` is true, the `Spectrogram` component for the recording track reads from `audioService.microphone.getFrequencyData()` in its rAF loop. Columns accumulate on an internal recording buffer starting at `recordingStartTime * pixelsPerSecond`. When recording stops and the track is finalized, `SpectrogramCache.analyse()` runs on the resulting `AudioBuffer` and replaces the live data with proper cached tiles.

**Files changed:**
- `src/components/workstation/Spectrogram.tsx` — add recording mode

**Verification:** Users see a growing spectrogram while recording. After recording stops, it seamlessly transitions to the cached static spectrogram.

---

### Step 11: Worker offloading for offline analysis

**Goal:** Move FFT analysis and tile rendering off the main thread to eliminate UI jank on large file uploads.

**What:** Create `src/services/spectrogram.worker.ts`. The worker receives `AudioBuffer` channel data via `postMessage` (transferred, not copied), creates its own `OfflineAudioContext`, runs FFT analysis, renders tiles, and returns `ImageBitmap[]` (transferable, zero-copy).

`SpectrogramCache.analyse()` delegates to the worker. No `SharedArrayBuffer` or `Cross-Origin-Isolation` headers required.

**Future upgrade path:** Start with the existing `OfflineAudioContext` FFT approach in the worker. If Safari support or custom windowing is needed later, swap to a pure-JS FFT library (e.g. `fft.js` ~5KB) or WASM (KissFFT ~50KB) within the same worker — the interface stays the same.

**Files created:**
- `src/services/spectrogram.worker.ts`

**Files changed:**
- `src/services/SpectrogramCache.ts` — delegate to worker

**Verification:** Large file uploads complete without UI jank. Multiple tracks can be analysed in parallel.

---

## Future Enhancements (Post-Core Implementation)

These items are not part of the core incremental plan but are enabled by the architecture and can be pursued independently after Step 11.

### Effects Chain Integration

When effects (delay, reverb) are added to Mawimbi, the architecture is ready:

- The `Tone.Analyser` is positioned after the effects chain, so live overlay (Step 8) automatically reflects post-effect audio.
- For offline spectrograms, a tile invalidation strategy is needed. Options: invalidate on parameter change, on next play, or on explicit user action. Defer this decision until effects are implemented.
- The signal chain would become: `Player → EffectsChain → Channel → Analyser → Destination`.

### Multi-Resolution Tile Cache (Zoom Mipmapping)

The current approach renders tiles at native resolution and zooms via `drawImage` scaling. For extreme zoom ranges, pre-render tiles at 2–3 mipmap levels (overview, mid, full). The `TileCache` can be extended with an LRU keyed by `${trackId}:${zoomLevel}:${tileIndex}`.

### Frequency Scale Improvements

The current logarithmic frequency mapping is adequate. Future options:
- **Mel scale:** `mel = 2595 * log10(1 + f/700)` — perceptually uniform spacing, better for music.
- **Dual-band approach** (Issue #26): Lowpass/highpass at 752 Hz with separate FFTs.
- **Essentia.js WASM** (~1 MB): Full audio analysis suite including mel spectrograms, BPM, key detection (Issue #9).

### Additional Polish

- **Pinch-to-zoom** gesture support (Issue #18)
- **Tile prefetching** — render tiles adjacent to viewport for smoother scrolling
- **Memory profiling** — after Step 5, profile GPU memory with 5+ tracks of 10-minute audio
- **Stereo spectrograms** — current implementation is mono (channel 0). Consider split or merged display.
- **Spectrogram export** — `canvas.toBlob()` from the tile cache makes PNG export straightforward.
- **AudioWorklet real-time FFT** — for lowest-latency analysis, an AudioWorklet processor could replace `AnalyserNode`.

---

## Files Summary

### New files (in creation order)

| Step | File | Purpose |
|------|------|---------|
| 1 | `src/services/SpectrogramCanvasRenderer.ts` | Extracted renderer class |
| 2 | (type export from `OfflineAnalyser.ts`) | `SpectrogramData` type |
| 3 | `src/services/SpectrogramTileRenderer.ts` | Frequency data + colour → `ImageBitmap[]` |
| 4 | `src/services/SpectrogramCache.ts` | Per-track tile cache |
| 5 | `src/hooks/useAnimationFrame.ts` | rAF hook with cleanup |
| 11 | `src/services/spectrogram.worker.ts` | Off-thread analysis |

### Modified files

| Step | File | Change |
|------|------|--------|
| 1 | `Spectrogram.tsx` | Remove renderer class |
| 2 | `OfflineAnalyser.ts` | Add `analyseToFrames()` |
| 4 | `AudioService.ts` | Add `spectrogramCache` property |
| 5 | `Spectrogram.tsx` | Full rewrite (tiled viewport) |
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

| Step | File |
|------|------|
| 6 | `Waveform.tsx` |
| 6 | `Waveform.test.tsx` |

### Unchanged files

`Scrubber.tsx`, `Mixer.tsx` (UI), `Channel.tsx`, `Toolbar.tsx`, `projectPageReducer.ts`, all signal files, `browserSupport.tsx` (still used for `touchEvents`), `Workstation.tsx`, all hooks except new `useAnimationFrame`.

---

## Key Technical Rationale

| Decision | Rationale |
|----------|-----------|
| **Canvas 2D over WebGL** | ~5x less code, `OffscreenCanvas` worker support, `ImageBitmap`/`putImageData` fast enough (<2ms per tile). WebGL upgrade path preserved. |
| **Tiled `ImageBitmap` over live canvas** | 2–3 `drawImage` blits vs. ~2M `fillRect` calls per frame. Critical for scroll and multi-track performance. |
| **`ImageData` batch painting for tiles** | Single memory write + GPU upload vs. thousands of `fillRect` with `fillStyle` string parsing. 10–50x faster. |
| **Keep `OfflineAudioContext` initially, worker FFT later** | Steps 2–5 use the existing Web Audio API approach. Step 11 moves it to a worker. Pure-JS FFT (for Safari/custom windowing) is a future upgrade within the same worker interface. |
| **`Tone.Analyser` for real-time** | Already the audio engine. Integrates naturally, no additional dependency. Lightweight overlay only — heavy lifting is offline. |
| **Deferred Safari spectrogram** | `OffscreenCanvas` Safari support is limited (v16.4+). Worker FFT with pure-JS library would resolve this but is deferred until needed. |

---

## Open Questions

1. **Effects invalidation policy:** When effects are added, should tile cache invalidate on parameter change, on next play, or on explicit user action?
2. **Tile resolution mipmapping:** Start with single native resolution. Add mipmap levels later if zoom quality is insufficient.
3. **Memory profiling:** After Step 5, profile GPU memory usage with 5+ tracks × 10 minutes to validate the approach at scale.
4. **Fade/opacity during live drawing:** `useTrackVolume` sets `opacity` on the container div affecting both static tiles and live overlay. Probably correct — verify visually.
5. **Mel spectrogram toggle:** Should the frequency scale be switchable between log and mel? Defer until user need is clear.
6. **Stereo display:** Current implementation is mono (channel 0). Evaluate need for stereo split/merge display.

---

## References

- [MDN: Visualizations with Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API)
- [MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [MDN: AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
- [Tone.js Analyser docs](https://tonejs.github.io/docs/15.0.4/Analyser)
- [Canvas optimization (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- Mawimbi issues: #5, #9, #18, #26, #27, #29, #99
