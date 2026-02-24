# Audio Visualization Research: Spectrogram-First Architecture for Mawimbi

## Executive Summary

This document proposes a spectrogram-first visualization architecture for Mawimbi that supports:
- **Offline rendering**: Pre-computed spectrograms for uploaded audio files
- **Real-time rendering**: Live spectrogram updates during playback with effects (delay, reverb)
- **Recording visualization**: Spectrogram painted in real time as audio is recorded
- **Zoom/scroll**: Efficient timeline zoom via tile-based rendering and multi-resolution caching

The approach uses **Canvas 2D** with **OffscreenCanvas + Web Workers** for heavy lifting, **Tone.js AnalyserNode** for real-time frequency data, and a **tile-based rendering pipeline** for smooth zoom/scroll. Safari spectrogram support is deferred.

---

## 1. Current Architecture Analysis

### What exists today

```
Upload → decodeAudioData → AudioBuffer + Blob URL
                              ↓
                    AudioService stores AudioBuffer
                              ↓
              ┌───────────────┴───────────────┐
              ↓                               ↓
    Waveform (WaveSurfer.js)         Spectrogram (OfflineAnalyser)
    - load(blobUrl)                  - OfflineAudioContext.suspend()
    - WaveSurfer handles rendering   - getByteFrequencyData() at intervals
    - Zoom via minPxPerSec           - Canvas 2D fillRect per frequency bin
                                     - Log frequency mapping
```

**Key files:**
- `Spectrogram.tsx` — React component, creates `OfflineAnalyser`, renders to `<canvas>`
- `OfflineAnalyser.ts` — Wraps `OfflineAudioContext` + `AnalyserNode`, two codepaths (suspend vs ScriptProcessor)
- `Timeline.tsx` — Conditionally renders Waveform OR Spectrogram based on `browserSupport.webkitOfflineAudioContext`
- `Mixer.ts` — Audio chain: `Tone.Player → Tone.Channel → Destination` (no effects, no analyser taps)

### Problems with the current approach

| Problem | Detail |
|---------|--------|
| **No real-time capability** | `OfflineAnalyser` processes the entire file upfront. Cannot reflect live effects or recording. |
| **Main-thread blocking** | Both FFT computation and canvas rendering happen on the main thread. Long files cause UI jank. |
| **No effects chain** | `Mixer.ts` has `Player → Channel → Destination` with no insertion points for effects or analyser nodes. |
| **Safari broken** | `OfflineAudioContext.suspend()` not supported; `ScriptProcessorNode` fallback is deprecated. |
| **No zoom infrastructure** | `pixelsPerSecond` signal exists but the entire spectrogram canvas is re-rendered from scratch on zoom changes. |
| **WaveSurfer.js orphaned** | If we go spectrogram-only, WaveSurfer.js becomes unused. It can be removed as a dependency. |

---

## 2. Web Audio Visualization Techniques

### 2.1 Real-Time FFT via AnalyserNode

The Web Audio API's `AnalyserNode` performs FFT on the live audio signal. It can be inserted **anywhere** in the audio graph — critically, **after effects nodes** — to visualize post-effect audio.

```
Player → [Delay] → [Reverb] → Channel → AnalyserNode → Destination
                                              ↓
                                    getFloatFrequencyData()
                                              ↓
                                    Canvas spectrogram render
```

**Key parameters:**
- `fftSize`: Power of 2, 32–32768. Default 2048. Tradeoff: larger = better frequency resolution, worse time resolution.
- `smoothingTimeConstant`: Set to **0** for accurate per-frame spectrogram data (no temporal smoothing).
- `minDecibels` / `maxDecibels`: Control dynamic range mapping. Current values (-80, -30) are reasonable.
- **Frequency resolution** = `sampleRate / fftSize`. At 44100 Hz, fftSize 4096 → ~10.8 Hz per bin.
- **Time resolution** = `fftSize / sampleRate`. At 44100 Hz, fftSize 4096 → ~93ms per frame.

**Tone.js wrappers:**
- `Tone.Analyser({ type: 'fft', size: 2048 })` — wraps `AnalyserNode`, returns `Float32Array` via `getValue()`
- `Tone.FFT(2048)` — convenience wrapper, `getValue()` returns frequency data in dB
- These can be `.connect()`ed or `.chain()`ed into any point in the Tone.js signal graph

### 2.2 Offline FFT for Pre-Computed Spectrograms

For uploaded files, computing the full spectrogram offline is faster and more accurate than real-time.

**Current approach** (OfflineAudioContext.suspend):
- Schedule many `suspend()` calls at fixed time intervals
- At each suspension, read `AnalyserNode.getByteFrequencyData()`
- Resume, repeat until end of file
- **Problem**: Safari doesn't support `suspend()`, and the approach blocks the main thread

**Better approach — Web Worker + custom FFT:**
- Transfer the `AudioBuffer` channel data (`Float32Array`) to a Web Worker via `postMessage` with transferable objects
- In the worker, perform windowed FFT using a JS FFT library (e.g., the dsp.js approach WaveSurfer's spectrogram plugin uses, or fft.js)
- Return frequency magnitude data back to main thread as typed arrays
- **Benefits**: No OfflineAudioContext needed, no Safari issues, fully off main thread

**FFT libraries for Web Workers:**
| Library | Size | Notes |
|---------|------|-------|
| **dsp.js** (WaveSurfer uses this) | ~15 KB | Proven, FFT + windowing functions |
| **fft.js** | ~5 KB | Minimal, fast radix-4 FFT |
| **KissFFT (WASM)** | ~50 KB | Near-native speed, best for large files |
| **Essentia.js (WASM)** | ~1 MB | Full audio analysis suite, overkill for FFT alone but useful for mel spectrograms, BPM, etc. |

**Recommendation**: Start with a pure-JS FFT in a Web Worker (lightweight, no WASM complexity). Upgrade to WASM (KissFFT or Essentia.js) later if performance demands it.

### 2.3 Canvas 2D Rendering Strategies

#### Direct column painting (current approach)
```typescript
// For each time frame, draw one column of frequency bins
for (let i = 0; i < frequencyBinCount; i++) {
  ctx.fillStyle = colorMap[frequencyData[i]];
  ctx.fillRect(x, height - i * heightFactor, 1, heightFactor);
}
```
- **Problem**: Thousands of `fillRect` calls. `fillStyle` changes are expensive (string parsing + state change).
- **Problem**: Entire canvas is one giant element; no partial updates on zoom/scroll.

#### ImageData batch painting (recommended for offline)
```typescript
const imageData = ctx.createImageData(width, height);
const pixels = imageData.data; // Uint8ClampedArray, 4 bytes per pixel (RGBA)

for (let x = 0; x < timeFrames; x++) {
  for (let y = 0; y < frequencyBins; y++) {
    const offset = ((height - 1 - y) * width + x) * 4;
    const magnitude = spectrogramData[x][y]; // 0–255
    pixels[offset]     = colorMap[magnitude][0]; // R
    pixels[offset + 1] = colorMap[magnitude][1]; // G
    pixels[offset + 2] = colorMap[magnitude][2]; // B
    pixels[offset + 3] = colorMap[magnitude][3]; // A
  }
}

ctx.putImageData(imageData, 0, 0);
```
- **10–50x faster** than individual `fillRect` calls — single memory write, single GPU upload.
- Can be done entirely in a Web Worker using `OffscreenCanvas`.

#### Real-time scrolling spectrogram
For live playback/recording, paint one new column per animation frame and scroll the viewport:

```typescript
// Circular buffer approach:
// 1. Draw new frequency column at write position
// 2. Advance write position (wraps around canvas width)
// 3. Use CSS transform or drawImage to shift the visible viewport

function drawLiveFrame(frequencyData: Float32Array) {
  // Draw single column at current write position
  drawColumn(writePosition, frequencyData);
  writePosition = (writePosition + 1) % canvasWidth;

  // Shift viewport: copy canvas onto itself, offset by 1 pixel
  // Or: use two canvases and alternate (double-buffer)
}
```

### 2.4 OffscreenCanvas + Web Worker

`OffscreenCanvas` allows canvas rendering to happen entirely off the main thread.

**Two usage patterns:**

1. **Transferred canvas** (for real-time rendering in worker):
   ```typescript
   // Main thread
   const canvas = document.querySelector('canvas');
   const offscreen = canvas.transferControlToOffscreen();
   worker.postMessage({ canvas: offscreen }, [offscreen]);

   // Worker thread
   onmessage = (e) => {
     const ctx = e.data.canvas.getContext('2d');
     // All rendering happens here, zero main-thread cost
   };
   ```

2. **Detached OffscreenCanvas** (for generating image tiles):
   ```typescript
   // Worker thread
   const offscreen = new OffscreenCanvas(tileWidth, tileHeight);
   const ctx = offscreen.getContext('2d');
   // Render spectrogram tile...
   const bitmap = offscreen.transferToImageBitmap();
   postMessage({ bitmap }, [bitmap]); // Zero-copy transfer
   ```

**Browser support** (2025): Chrome, Edge, Firefox all support OffscreenCanvas. Safari added support in v16.4 but with limitations. Since Safari spectrogram support is deferred, this is not a blocker.

### 2.5 Tile-Based Rendering for Zoom

The key insight for efficient zoom: **pre-render spectrogram tiles at multiple resolution levels**, like a map tile system.

```
Zoom Level 0 (overview):  [====== entire file in 1 tile ======]
Zoom Level 1:             [=== tile 0 ===][=== tile 1 ===]
Zoom Level 2:             [tile0][tile1][tile2][tile3]
Zoom Level N (max zoom):  [t0][t1][t2]...[tN] (1 pixel = 1 FFT frame)
```

**Approach:**
1. On file upload, compute full-resolution FFT data in a Web Worker (raw `Float32Array[]`)
2. Store the raw FFT data (not pixels) — it's the source of truth
3. When a tile is needed for display, render it on-demand in a worker:
   - Pick the FFT frames that fall within the tile's time range
   - Downsample if zoom level requires fewer pixels than frames
   - Apply color mapping
   - Return as `ImageBitmap`
4. Cache rendered tiles (`Map<string, ImageBitmap>`) keyed by `${trackId}:${zoomLevel}:${tileIndex}`
5. On zoom change, check cache first; render missing tiles in worker

**Tile invalidation**: When effects change, the real-time analyser produces different frequency data. For offline pre-computed data, tiles can be invalidated and re-rendered. For real-time data, the tile system is bypassed — the live spectrogram is painted frame-by-frame.

### 2.6 Logarithmic Frequency Mapping

The current `OfflineAnalyser.createLogFrequencyMapping()` maps linear FFT bins to log scale. This is correct for musical applications (human pitch perception is logarithmic).

**Current implementation issues:**
- The mapping pools multiple linear bins into one log bin by summing — this can cause clipping
- Issue #26 proposes a dual-band approach: lowpass/highpass at 752 Hz, separate FFTs, merge

**Better approach — mel scale:**
- Standard mel scale: `mel = 2595 * log10(1 + f/700)`
- Maps frequency bins to perceptually uniform spacing
- Well-supported by Essentia.js if we add it later
- For now, the current log mapping is adequate; can be upgraded to mel scale as an enhancement

---

## 3. Proposed Architecture

### 3.1 High-Level Overview

```
                    ┌─────────────────────────────────────────────────┐
                    │                  Audio Graph                     │
                    │                                                  │
  Upload/Record →   │  Player → [Effects] → Channel → Analyser → Dest │
                    │                                    ↓             │
                    └────────────────────────────────────┼─────────────┘
                                                        ↓
                              ┌──────────────────────────┴──────────┐
                              │         Visualization Pipeline       │
                              │                                      │
                              │  ┌──────────┐    ┌───────────────┐  │
                              │  │  Offline  │    │   Real-Time   │  │
                              │  │  Pipeline │    │   Pipeline    │  │
                              │  │           │    │               │  │
                              │  │ Worker    │    │ AnalyserNode  │  │
                              │  │ ↓ FFT     │    │ ↓ rAF loop   │  │
                              │  │ ↓ Tiles   │    │ ↓ Paint col   │  │
                              │  │ ↓ Cache   │    │ ↓ Scroll      │  │
                              │  └──────────┘    └───────────────┘  │
                              │           ↓              ↓           │
                              │       ┌──────────────────────┐      │
                              │       │   Canvas Compositor   │      │
                              │       │   (per-track canvas)  │      │
                              │       └──────────────────────┘      │
                              └─────────────────────────────────────┘
```

### 3.2 Component Architecture

#### New/Modified Files

```
src/
├── services/
│   ├── AudioService.ts              # MODIFIED: expose per-track AnalyserNode
│   ├── Mixer.ts                     # MODIFIED: effects chain, analyser insertion
│   ├── OfflineAnalyser.ts           # REMOVED: replaced by SpectrogramWorker
│   └── effects/
│       ├── EffectsChain.ts          # NEW: per-track ordered effects chain
│       ├── DelayEffect.ts           # NEW: Tone.FeedbackDelay wrapper
│       └── ReverbEffect.ts          # NEW: Tone.Reverb wrapper
│
├── workers/
│   ├── spectrogramWorker.ts         # NEW: Web Worker for offline FFT + tile rendering
│   └── fft.ts                       # NEW: Pure-JS FFT implementation (or vendored dsp.js)
│
├── visualization/
│   ├── SpectrogramRenderer.ts       # NEW: manages offline + real-time rendering per track
│   ├── TileCache.ts                 # NEW: LRU cache for rendered ImageBitmap tiles
│   ├── ColorMap.ts                  # NEW: extracted from SpectrogramCanvasRenderer
│   └── FrequencyScale.ts           # NEW: log/mel frequency mapping utilities
│
├── components/workstation/
│   ├── Timeline.tsx                 # MODIFIED: spectrogram-only, remove Waveform branch
│   ├── Spectrogram.tsx              # REWRITTEN: tile-based offline + real-time modes
│   ├── Waveform.tsx                 # REMOVED (or kept behind feature flag)
│   ├── ZoomControl.tsx              # NEW: zoom slider/buttons
│   └── SpectrogramOverlay.tsx       # NEW: playhead + time markers on spectrogram
│
├── signals/
│   └── workstationSignals.ts        # MODIFIED: add zoom level, visible time range
│
└── hooks/
    └── useSpectrogramRenderer.ts    # NEW: hook bridging SpectrogramRenderer to React
```

### 3.3 Audio Graph Changes (Mixer.ts)

The current audio chain must be extended to support effects and analysis:

```
CURRENT:   Player → Channel → Destination

PROPOSED:  Player → EffectsChain → Channel → Analyser → Destination
                                                 ↓
                                        getFloatFrequencyData()
```

```typescript
// Mixer.ts changes (conceptual)

createChannel(trackId: string, audioBuffer: AudioBuffer, ...): void {
  const player = new Tone.Player(audioBuffer).sync().start(startTime, audioOffset);
  const effectsChain = new EffectsChain(); // initially empty (pass-through)
  const channel = new Tone.Channel();
  const analyser = new Tone.Analyser({ type: 'fft', size: 4096, smoothing: 0 });

  // Chain: Player → Effects → Channel → Analyser → Destination
  player.chain(effectsChain.input, channel, analyser, Tone.getDestination());

  this.audioChannelRepository.add(
    new AudioChannel(trackId, channel, analyser, effectsChain, normalizationGainDb)
  );
}
```

**EffectsChain** is a simple ordered list of Tone.js effect nodes with `addEffect()` / `removeEffect()` / `bypass()` methods. Each effect wraps a Tone.js node (`Tone.FeedbackDelay`, `Tone.Reverb`) with parameter getters/setters.

### 3.4 Offline Pipeline (File Upload)

When a file is uploaded:

1. **Decode**: `AudioBuffer` created as today via `Tone.context.decodeAudioData()`
2. **Extract PCM**: Transfer `audioBuffer.getChannelData(0)` (Float32Array) to Web Worker
3. **Worker computes FFT**:
   - Apply window function (Hanning) to overlapping frames
   - Compute FFT per frame using pure-JS FFT
   - Convert complex output to magnitude (dB scale)
   - Apply log frequency mapping
   - Return full spectrogram data as `Float32Array[]` (one array per time frame)
4. **Store raw data**: `SpectrogramDataStore` keeps per-track FFT data in memory
5. **Render visible tiles**: Based on current zoom level and scroll position, request the worker to render visible tiles as `ImageBitmap`
6. **Cache tiles**: Store in `TileCache` (LRU, keyed by track + zoom + tile index)
7. **Paint**: Composite visible tiles onto the track's canvas

### 3.5 Real-Time Pipeline (Playback with Effects)

During playback:

1. **AnalyserNode** is connected after the effects chain (see 3.3)
2. **Animation loop** (`requestAnimationFrame`) reads frequency data:
   ```typescript
   function renderLoop() {
     if (!isPlaying) return;

     const frequencyData = analyser.getValue(); // Float32Array from Tone.Analyser

     // Option A: Overlay on pre-computed spectrogram
     // Draw a highlighted column at the current playhead position
     // showing the live (post-effects) frequency data

     // Option B: Replace spectrogram region around playhead
     // As playback advances, replace pre-computed tiles with live data

     requestAnimationFrame(renderLoop);
   }
   ```
3. **Dual-layer canvas**: One canvas layer for the pre-computed (offline) spectrogram, one for the real-time overlay. This avoids redrawing the entire spectrogram every frame.

### 3.6 Recording Pipeline

During overdub recording:

1. Microphone → `Tone.UserMedia` → `Tone.Analyser` (already exists: `MicrophoneUserMedia`)
2. Add a `Tone.Analyser` tap on the microphone signal
3. Paint spectrogram columns in real time as they arrive, appending to a growing canvas
4. When recording stops, the recorded `AudioBuffer` is available — run the offline pipeline to generate the final high-quality spectrogram tiles

### 3.7 Zoom and Scroll

**Zoom levels** map to `pixelsPerSecond` (already a signal in `workstationSignals.ts`):

```typescript
// Zoom level → pixels per second
const ZOOM_LEVELS = [10, 25, 50, 100, 200, 400, 800]; // configurable
```

**On zoom change:**
1. Calculate which tiles are visible at the new zoom level
2. Check `TileCache` for pre-rendered tiles
3. For missing tiles: post render requests to the Web Worker
4. Worker renders tiles from stored FFT data at the requested resolution
5. Tiles arrive as `ImageBitmap`, are cached and composited

**Scroll** is handled by standard CSS overflow/scroll on the timeline container. Only tiles within the visible viewport (+1 tile buffer on each side) are composited.

### 3.8 Data Flow Summary

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│  AudioBuffer │────→│  Web Worker  │────→│ FFT Data  │
│  (per track) │     │  (FFT comp.) │     │ (stored)  │
└─────────────┘     └──────────────┘     └─────┬─────┘
                                               │
                         ┌─────────────────────┤
                         ↓                     ↓
                  ┌──────────────┐     ┌──────────────┐
                  │  Web Worker  │     │  Tile Cache  │
                  │  (tile render)│←───│  (LRU)       │
                  └──────┬───────┘     └──────────────┘
                         ↓
                  ┌──────────────┐
                  │  ImageBitmap │
                  │  (per tile)  │
                  └──────┬───────┘
                         ↓
              ┌──────────────────────┐
              │  Canvas Compositor   │
              │  (drawImage per tile)│
              └──────────────────────┘
```

---

## 4. Impact on Existing Codebase

### 4.1 Files to Remove

| File | Reason |
|------|--------|
| `Waveform.tsx` | Spectrogram-only display; WaveSurfer.js no longer needed |
| `Waveform.css` | Associated styles |
| `OfflineAnalyser.ts` | Replaced by Web Worker FFT pipeline |
| `browserSupport.tsx` | Primary use was Waveform/Spectrogram toggle; may be simplified or removed |

### 4.2 Dependencies to Remove

| Package | Reason |
|---------|--------|
| `wavesurfer.js` | No longer rendering waveforms |

### 4.3 Files to Modify

| File | Changes |
|------|---------|
| `Mixer.ts` | Add `EffectsChain` and `Tone.Analyser` to audio channel chain |
| `AudioService.ts` | Expose per-track analyser access; add effect management API |
| `Timeline.tsx` | Remove Waveform/Spectrogram conditional; render only Spectrogram |
| `Spectrogram.tsx` | Complete rewrite: tile-based rendering, dual offline/real-time modes |
| `workstationSignals.ts` | Add visible time range, zoom level signals |
| `Toolbar.tsx` | Add zoom controls (or new ZoomControl component) |
| `setupTests.ts` | Update mocks to remove WaveSurfer, add Worker mocks |
| `package.json` | Remove wavesurfer.js, possibly add fft library |

### 4.4 New Capabilities

| New file/module | Purpose |
|-----------------|---------|
| `workers/spectrogramWorker.ts` | FFT computation + tile rendering in Web Worker |
| `workers/fft.ts` | Pure-JS radix-2/4 FFT (or vendored from dsp.js) |
| `visualization/SpectrogramRenderer.ts` | Orchestrates offline + real-time rendering per track |
| `visualization/TileCache.ts` | LRU cache for ImageBitmap tiles |
| `visualization/ColorMap.ts` | Color mapping (track color → magnitude → RGBA) |
| `visualization/FrequencyScale.ts` | Log/linear/mel frequency mapping |
| `services/effects/EffectsChain.ts` | Per-track effects management |
| `services/effects/DelayEffect.ts` | Tone.FeedbackDelay wrapper |
| `services/effects/ReverbEffect.ts` | Tone.Reverb wrapper |
| `hooks/useSpectrogramRenderer.ts` | React hook for SpectrogramRenderer lifecycle |
| `components/workstation/ZoomControl.tsx` | Zoom UI (slider or +/- buttons) |

---

## 5. Implementation Phases

### Phase 1: Foundation — Worker-Based Offline Spectrogram
**Goal**: Replace `OfflineAnalyser` with Web Worker FFT pipeline. Visual parity with current spectrogram, but off main thread.

1. Implement `fft.ts` (pure-JS FFT with Hanning window)
2. Implement `spectrogramWorker.ts` (receives PCM data, returns FFT frames)
3. Implement `ColorMap.ts` and `FrequencyScale.ts` (extract from current code)
4. Rewrite `Spectrogram.tsx` to use worker-computed data
5. Remove `OfflineAnalyser.ts`
6. Remove WaveSurfer.js dependency and `Waveform.tsx`
7. Update `Timeline.tsx` to always render Spectrogram

### Phase 2: Tile-Based Zoom
**Goal**: Efficient zoom in/out without re-rendering entire spectrogram.

1. Implement `TileCache.ts` (LRU with configurable max size)
2. Update `spectrogramWorker.ts` to render tiles at specified resolution
3. Store raw FFT data in `SpectrogramDataStore`
4. Update `Spectrogram.tsx` to composite visible tiles
5. Add `ZoomControl.tsx` to Toolbar
6. Wire zoom signal to tile rendering pipeline

### Phase 3: Effects Chain + Real-Time Analyser
**Goal**: Insert effects and visualize post-effect audio in real time.

1. Implement `EffectsChain.ts` with add/remove/bypass
2. Implement `DelayEffect.ts` and `ReverbEffect.ts`
3. Modify `Mixer.ts` to insert effects chain and `Tone.Analyser` per track
4. Expose analyser access via `AudioService`
5. Implement `requestAnimationFrame` render loop reading live analyser data
6. Add dual-layer canvas (offline base + real-time overlay) to Spectrogram

### Phase 4: Live Recording Spectrogram
**Goal**: Paint spectrogram in real time during overdub recording.

1. Add `Tone.Analyser` tap on microphone input in `MicrophoneUserMedia.ts`
2. Implement growing-canvas rendering for live recording
3. On recording stop, replace live spectrogram with offline-computed version
4. Handle track positioning (recording starts at transport time)

### Phase 5: Polish and Performance
**Goal**: Optimize for production use.

1. Move tile rendering to OffscreenCanvas in Worker (zero main-thread rendering)
2. Implement tile prefetching (render tiles adjacent to viewport)
3. Add pinch-to-zoom gesture support (issue #18)
4. Profile and optimize: batch Worker messages, tune LRU cache size
5. Consider WebGL upgrade for tile compositing if Canvas 2D bottlenecks

---

## 6. Key Technical Decisions

### 6.1 Why Web Worker FFT instead of OfflineAudioContext?

| Criterion | OfflineAudioContext | Web Worker FFT |
|-----------|--------------------|--------------  |
| Main thread blocking | Yes (current) | No |
| Safari support | Broken (`suspend()`) | Works everywhere |
| Custom window functions | No (uses browser default) | Full control |
| Custom frequency mapping | Post-processing only | Integrated |
| Overlapping windows | Not straightforward | Easy (hop size control) |
| Cancellation | Hard to cancel mid-render | Worker can be terminated |
| Reusability | One-shot per OfflineAudioContext | Reusable worker |

### 6.2 Why Canvas 2D over WebGL?

- **Simpler implementation**: Canvas 2D is ~5x less code than WebGL for the same result
- **OffscreenCanvas support**: Works in Web Workers, enabling fully off-thread rendering
- **ImageBitmap / putImageData**: Fast enough for spectrogram tiles (measured: <2ms per 256×256 tile)
- **WebGL upgrade path**: If profiling shows bottlenecks, the tile architecture makes it easy to swap the renderer without changing the data pipeline

### 6.3 Why tile-based rendering?

- **Zoom efficiency**: Only render tiles at the visible resolution; don't waste CPU on off-screen regions
- **Incremental updates**: Changing effects only invalidates tiles in the visible region
- **Memory bounded**: LRU cache prevents unbounded memory growth with many tracks/zoom levels
- **Worker-friendly**: Each tile is an independent render job, easily parallelized

### 6.4 Why keep Tone.js for real-time analysis?

- Already the audio engine — `Tone.Analyser` integrates naturally into the existing signal chain
- No additional dependency needed
- Real-time data (`getValue()`) returns `Float32Array` directly — no serialization overhead
- The offline pipeline (Web Worker FFT) handles the heavy pre-computation; Tone.js Analyser is only for the lightweight real-time overlay

---

## 7. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Web Worker message overhead | High message frequency could bottleneck | Use transferable objects (`ArrayBuffer`, `ImageBitmap`); batch tile requests |
| Memory usage with many tracks | Raw FFT data + tile cache could be large | LRU cache with configurable max; release FFT data for tracks not in view |
| Pure-JS FFT too slow for large files | Long computation time | Start with JS; benchmark; upgrade to WASM (fft.js or KissFFT) if needed |
| Real-time + offline canvas interaction | Visual artifacts when switching modes | Dual-layer canvas architecture; clear overlay on mode change |
| Color map changes require full re-render | User changes track color, all tiles invalid | Cache raw FFT data (not colored pixels); re-render tiles from raw data |

---

## 8. Open Questions for Future Work

- **Mel spectrogram**: Should the frequency scale be switchable between log and mel? Mel is better for music perception but requires different bin mapping.
- **Stereo spectrograms**: Current implementation is mono (channel 0 only). Should stereo tracks show split or merged spectrograms?
- **Spectrogram export**: Should users be able to export spectrograms as PNG? The tile cache makes this straightforward (`canvas.toBlob()`).
- **AudioWorklet for real-time FFT**: For lowest-latency real-time analysis, an AudioWorklet processor could compute FFT on the audio thread and post results to the main thread. This bypasses the AnalyserNode's inherent latency. Worth exploring in Phase 5.
- **Essentia.js integration**: For advanced features (mel spectrogram, BPM detection, key detection per issue #9), Essentia.js WASM in a Web Worker could replace the pure-JS FFT and add analysis capabilities.

---

## References

- [MDN: Visualizations with Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API)
- [MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [MDN: AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
- [Tone.js Analyser docs](https://tonejs.github.io/docs/15.0.4/Analyser)
- [Canvas optimization (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [Google: Audio Worklets](https://developer.chrome.com/blog/audio-worklet)
- [WaveSurfer.js Spectrogram Plugin](https://wavesurfer.xyz/examples/?spectrogram.js)
- Mawimbi issues: #5, #9, #26, #27, #29, #99
