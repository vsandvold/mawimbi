# Step 11 Analysis: Worker Offloading for Offline Analysis

## Context

Steps 1-10 of the unified visualization plan are complete (PRs #126-#150). Step 11 is the final step: moving FFT analysis and tile rendering into a Web Worker to eliminate main-thread blocking during large file uploads.

The current plan (UNIFIED_VISUALIZATION_PLAN.md) describes: create `spectrogram.worker.ts`, transfer `AudioBuffer` channel data via `postMessage`, run `OfflineAudioContext` + FFT in the worker, render tiles, and return `ImageBitmap[]` as transferables. It notes a "future upgrade path" to pure-JS FFT or WASM.

This document evaluates the key technology choices and architectural approaches referenced across the plans and issues (#5, #9, #26, #27, #29, #99).

---

## 1. FFT Engine: OfflineAudioContext vs. Pure-JS FFT vs. WASM

### A. OfflineAudioContext in Worker (current plan)

**Pros:**
- Zero new dependencies — uses the browser's built-in Web Audio API
- Already proven in the codebase (`OfflineAnalyser.ts` uses this today)
- Highly optimized native FFT implementation in the browser engine
- Simplest migration — move existing logic into worker
- `ImageBitmap` and `ArrayBuffer` are transferable, so zero-copy return

**Cons:**
- `OfflineAudioContext` availability in workers varies — good in Chrome/Firefox, added in Safari 16.4+ with quirks
- `OfflineAudioContext.suspend()` still doesn't work on Safari (Issue #27) — the `ScriptProcessorNode` fallback is deprecated and unavailable in workers
- No control over windowing function (Hanning, Hamming, etc.) — locked to browser implementation
- No overlapping windows (hop size control) — `suspend()` gives coarse time steps
- Cannot produce mel-scale spectrograms natively — only linear-frequency FFT bins
- One-shot: each `OfflineAudioContext` renders only once, requiring fresh context per analysis

### B. Pure-JS FFT (fft.js ~5KB, dsp.js ~15KB)

**Pros:**
- Works everywhere — no Web Audio dependency, runs in any worker, any browser
- Full control over windowing (Hanning, Blackman-Harris) and hop size
- Can compute mel-scale spectrograms with a filterbank applied post-FFT
- Lightweight — fft.js is ~5KB
- Easy to unit test in jsdom/Node
- Solves Safari issue (#27) completely

**Cons:**
- 5-10x slower than native `AnalyserNode` FFT for the same data size
- For a 10-minute file at 44.1kHz with fftSize=4096 and hop=1024: ~25,800 FFT frames — could take 2-5 seconds in JS vs. <1 second native
- Must manually handle PCM windowing, magnitude conversion, dB scaling
- More code to maintain and test

### C. WASM FFT (KissFFT ~50KB)

**Pros:**
- Near-native performance (typically within 2x of native `AnalyserNode`)
- Full control over windowing and hop size, same as pure-JS
- Works in all workers without Web Audio dependency
- KissFFT is well-tested, BSD-licensed
- Solves Safari issue (#27)

**Cons:**
- WASM build complexity — requires C/C++ toolchain (Emscripten) or vendored pre-built binaries
- Debugging WASM in workers is harder than JS
- ~50KB additional download vs. 5KB for pure-JS
- Must handle WASM memory management (allocate/free buffers)
- Overkill if pure-JS performance is acceptable

### D. Essentia.js WASM (~1MB)

**Pros:**
- Production-grade audio analysis suite from MTG/UPF
- Built-in mel spectrogram (`essentia.MelSpectrogram()`) — no manual filterbank
- Additional features: BPM, key detection, onset detection, loudness (Issue #9)
- Correct windowing, overlap, normalization out of the box
- Active maintenance, good documentation
- Could power future DSP features from the same dependency
- Designed for Web Worker use

**Cons:**
- **~1MB download** — significant for a web app with a currently modest bundle
- Heavy dependency for what is initially just FFT + color mapping
- WASM memory management required (manual `deleteVector()` calls)
- Learning curve for the Essentia API
- Overkill for Step 11 in isolation — paying cost upfront for features that may not be built
- Risk of memory leaks if WASM cleanup is missed during rapid analysis cycles

---

## 2. Dual-Band FFT Approach (Issue #26)

Split the signal at 752 Hz with lowpass/highpass filters, run separate 1024-point FFTs, merge into a single log-frequency spectrogram.

**Pros:**
- Better frequency resolution in bass range without sacrificing treble time resolution
- 1024-point FFT at 44.1kHz gives ~43Hz resolution — usable for bass fundamentals
- Perceptually better representation of musical content
- Well-established technique in audio analysis literature

**Cons:**
- Doubles FFT computation per frame
- Requires signal splitting (filter design) in Web Audio or JS/WASM
- Merging two spectrograms with different resolutions is non-trivial — the 752Hz boundary needs smooth interpolation
- Increases tile renderer complexity (two data sources per frame)
- The simpler alternative — larger fftSize (8192 or 16384) — gives better bass resolution at the cost of time resolution, which may be acceptable for offline spectrograms

---

## 3. Audio Worklets for Real-Time Analysis

Replace `Tone.Analyser`/`AnalyserNode` with an `AudioWorkletProcessor` for lowest-latency real-time FFT.

**Pros:**
- Runs on the audio rendering thread — guaranteed sample-accurate timing
- Can compute FFT per audio block (128 samples) — finer time resolution than `AnalyserNode`
- No inherent one-frame latency of `AnalyserNode`
- Modern API replacing deprecated `ScriptProcessorNode`

**Cons:**
- Significantly more complex — separate processor class, message passing, synchronization
- The real-time overlay (Step 8) draws one column per animation frame (~16ms at 60fps). AudioWorklet produces data at ~3ms intervals — the vast majority would be discarded
- `Tone.Analyser` already works well for the "bright column at playhead" use case with zero additional code
- AudioWorklet FFT requires a JS FFT library in the worklet scope
- Testing is harder (no jsdom support)

---

## 4. OffscreenCanvas + Web Workers

**Pros:**
- Tile rendering (`putImageData` + `transferToImageBitmap`) happens entirely off main thread
- `ImageBitmap` is transferable — zero-copy return to main thread
- Main thread only does `drawImage()` blits — essentially free
- Already designed into the plan (Step 3's `SpectrogramTileRenderer` uses `OffscreenCanvas`)

**Cons:**
- Safari `OffscreenCanvas` worker support added in 16.4 with limitations — `transferToImageBitmap()` may not be available in all versions
- No jsdom support — need Playwright or real browser tests
- If using `OfflineAudioContext` in the worker, that's two APIs with Safari worker-compatibility concerns

---

## 5. Canvas Rendering Optimization (Issue #29)

The plan already addresses most Issue #29 ideas:

| Issue #29 Idea | Plan Coverage |
|---|---|
| OffscreenCanvas + Web Worker | Step 11 |
| requestAnimationFrame | Step 5 (`useAnimationFrame` hook) |
| Render by color first | Superseded by `putImageData` batch painting (Step 3) — faster than grouping by color |
| Reverse while loops / bitshift | Micro-optimizations — unnecessary with tiled `ImageBitmap` approach (2-3 `drawImage` calls per frame) |
| Limit garbage collection | Addressed by reusing `Uint8Array` buffers in `analyseToFrames()` |

WebGL for tile compositing is correctly deferred — Canvas 2D `drawImage` of pre-rendered `ImageBitmap` tiles is GPU-accelerated and handles dozens of tracks. WebGL would only matter if the compositor itself became the bottleneck (unlikely at 2-3 drawImage calls per frame per track).

---

## Recommendation

### For Step 11: follow the existing plan with one refinement

1. **Implement the worker with `OfflineAudioContext`** as the FFT engine. This is the lowest-risk path that delivers the core goal (non-blocking UI). The `SpectrogramTileRenderer` already uses `OffscreenCanvas`, so tile rendering in the worker is straightforward.

2. **Design the worker interface to be engine-agnostic.** The worker accepts `Float32Array` channel data and returns `ImageBitmap[]`. Internally it uses `OfflineAudioContext` today, but the interface shouldn't leak this. This allows swapping to pure-JS FFT or WASM later without changing `SpectrogramCache`.

   ```typescript
   // Worker message interface (engine-agnostic)
   type WorkerInput = {
     channelData: Float32Array;  // transferred
     sampleRate: number;
     duration: number;
     color: TrackColor;
     tileWidth: number;
   };
   type WorkerOutput = {
     tiles: ImageBitmap[];  // transferred
     spectrogramData: SpectrogramData;  // for cache
   };
   ```

3. **Add a Safari detection path** in the worker: if `OfflineAudioContext` is unavailable or broken, fall back to a bundled fft.js (~5KB). This solves Issue #27 without Essentia's 1MB cost.

4. **Defer Essentia.js** until Issue #9 features (BPM, key detection, mel spectrograms) are actively pursued. At that point Essentia replaces the FFT engine inside the worker — the interface stays the same.

5. **Defer the dual-band approach** (Issue #26) until bass resolution is a demonstrated need. Try larger fftSize first as a simpler alternative.

6. **Defer AudioWorklet** — `Tone.Analyser` is sufficient for real-time overlay (Steps 7-10).

### Rationale

The worker interface is the stable contract — the FFT engine behind it is a swappable implementation detail. Starting with `OfflineAudioContext` delivers value immediately with zero new dependencies. The engine-agnostic interface preserves every future upgrade path (pure-JS FFT, KissFFT WASM, Essentia.js WASM) without architectural changes. Each enhancement from the "Future Enhancements" section of the unified plan can be pursued independently by swapping the worker internals.

### Summary table

| Approach | When to adopt | Trigger |
|---|---|---|
| OfflineAudioContext in worker | **Step 11 (now)** | Core implementation |
| Pure-JS FFT fallback (fft.js) | **Step 11 (now)** | Safari detection in worker |
| KissFFT WASM | Later | If pure-JS FFT proves too slow for files >10 min |
| Essentia.js WASM | Later | When Issue #9 features (BPM, key, mel) are prioritized |
| Dual-band FFT (Issue #26) | Later | If bass resolution complaints arise; try larger fftSize first |
| AudioWorklet real-time FFT | Later | Only if sample-accurate spectrogram rendering is needed |
| WebGL tile compositing | Later | Only if Canvas 2D `drawImage` becomes a bottleneck |
