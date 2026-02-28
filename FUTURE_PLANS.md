# Mawimbi — Future Plans

> Consolidated from MODERNIZATION_PLAN.md, MIGRATION.md, VISUALIZATION_PLAN.md,
> UNIFIED_VISUALIZATION_PLAN.md, RECORDING_PLAN.md, docs/audio-visualization-research.md,
> docs/research/low-latency-overdubbing.md, docs/step-11-analysis.md, and open issues.
>
> Last updated: 2026-02-28

---

## Completed Work

Everything below has shipped. These plans and milestones are **done** and need no
further action.

### Modernization (MODERNIZATION_PLAN.md)

All five phases complete. The project migrated from Node 12 / React 16 / CRA 4 /
Jest / Yarn / Ant Design 4 / React Router 5 / react-beautiful-dnd to:

| Area | Target | Result |
|------|--------|--------|
| Runtime | Node 22 LTS | Done |
| Framework | React 19 | Done |
| Language | TypeScript 5 | Done |
| Bundler | Vite | Done (now Vite 7) |
| Test runner | Vitest | Done (now Vitest 4) |
| UI library | Ant Design 5 (dark theme, CSS-in-JS) | Done |
| Routing | React Router v7 (library mode) | Done |
| Drag & drop | @dnd-kit | Done |
| Linting | ESLint 9 flat config + Prettier | Done |
| Git hooks | Husky 9 + lint-staged | Done |
| Package manager | npm | Done |
| CI | GitHub Actions | Done |
| E2E testing | Playwright | Done |
| Deployment | Netlify | Done |

### Signal-Synced Architecture (MIGRATION.md)

Phases 1–7 complete (PRs #103–#111, #114):

- **Phase 1:** Foundation — `@preact/signals-react`, signal modules, COEP/COOP headers
- **Phase 2:** Per-track volume signals replacing reducer state
- **Phase 3:** Mute/solo signals with computed `mutedTracks`
- **Phase 4:** Transport & playback signals
- **Phase 5:** Track focus signals with debounced unfocus
- **Phase 6:** React Compiler cleanup — removed unnecessary memoization
- **Phase 7:** Undo/redo (`useUndoReducer`) and `DELETE_TRACK` action

### Spectrogram Visualization (UNIFIED_VISUALIZATION_PLAN.md)

All 11 steps complete (PRs #125–#150):

- **Steps 1–4:** Extracted renderer, `analyseToFrames`, `SpectrogramTileRenderer`, `SpectrogramCache`
- **Step 5:** Tiled viewport rendering with `ImageBitmap` blitting
- **Step 6:** Removed WaveSurfer.js and `Waveform.tsx` entirely
- **Steps 7–8:** `Tone.Analyser` on mixer channels, live playback overlay
- **Steps 9–10:** `Tone.Analyser` on `MicrophoneUserMedia`, recording spectrogram with `RecordingBuffer`
- **Step 11:** Web Worker offloading for offline FFT analysis and tile rendering

### Audio Features

- Loudness normalization (`LoudnessNormalizer` service, PR #119)
- Loudness-driven scrubber pulsation (PR #101)
- Basic overdub recording with transport synchronization (PRs #123–#124, #130–#131, #134)

---

## Future Work

Organised by theme. Items closer to the top of each section are higher priority
or lower effort. Issue references link to the tracker for discussion.

---

### 1. Spectrogram Quality & Browser Support

These build directly on the Step 11 worker architecture — the engine-agnostic
interface means the FFT engine is swappable without changing `SpectrogramCache`
or any component code.

#### 1a. Safari spectrogram fix — Issue #27

Safari workers lack `OfflineAudioContext.suspend()`, and `ScriptProcessorNode`
is unavailable in workers. Bundle a pure-JS FFT library (~5 KB) as a fallback
engine inside the existing worker.

**Approach:**

1. Detect `OfflineAudioContext` availability inside the worker on first message.
2. If unavailable, fall back to `fft.js` (pure JS, ~5 KB gzipped).
3. Implement windowing (Hann) and FFT manually, mapping output to the same
   `SpectrogramData` structure the worker already returns.
4. No interface changes — `SpectrogramCache` and all components remain untouched.

**Candidate libraries** (from docs/step-11-analysis.md):

| Library | Size | Performance | Notes |
|---------|------|-------------|-------|
| fft.js | ~5 KB | Good enough for offline | Pure JS, zero dependencies |
| KissFFT (WASM) | ~50 KB | Near-native | Requires WASM build step |
| Essentia.js | ~1 MB | Native | Overkill for just FFT; save for §3 |

**Recommendation:** Start with `fft.js`. Upgrade to KissFFT WASM only if
analysis time on large files (>10 min) is unacceptable.

#### 1b. Dual-band FFT for bass resolution — Issue #26

Current single-FFT approach has poor low-frequency resolution. The dual-band
technique splits the signal at ~752 Hz, applies separate FFTs (1024-point each)
to the low and high bands, then merges into one log-frequency spectrogram.

**Approach:**

1. Add a lowpass/highpass filter pair inside the worker before FFT analysis.
2. Run two parallel FFT passes with smaller windows.
3. Merge the resulting frequency frames.
4. Return the same `SpectrogramData` structure — transparent to consumers.

**Prerequisite:** Consider after §1a ships, since Safari needs the pure-JS path
first.

#### 1c. Mel-scale frequency mapping

Replace the current logarithmic mapping with a perceptually uniform mel scale:
`mel = 2595 × log10(1 + f/700)`. Better for musical content.

**Approach:** Swap `createLogFrequencyMapping` in the worker. Optionally expose a
toggle in the UI.

#### 1d. Multi-resolution tile cache (zoom mipmapping)

The current approach renders tiles at native resolution and scales via
`drawImage`. For extreme zoom ranges, pre-render tiles at 2–3 mipmap levels
(overview, mid, full). Extend the cache with an LRU keyed by
`${trackId}:${zoomLevel}:${tileIndex}`.

**Trigger:** Profile GPU memory and rendering quality after several tracks of
10+ minute audio. Implement only if zoom artifacts are visible.

---

### 2. Canvas & Rendering Performance — Issue #29

#### 2a. Tile prefetching

Render tiles adjacent to the visible viewport during idle frames for smoother
scrolling. Use `requestIdleCallback` or a small lookahead buffer.

#### 2b. WebGL tile compositing

Replace Canvas 2D `drawImage` blitting with a WebGL quad renderer. Benefits:
- GPU-accelerated compositing of overlapping tracks.
- Per-tile opacity and colour-grading in the shader.
- Path to real-time effects on the spectrogram (e.g. highlight selection).

The tile `ImageBitmap` pipeline remains the same — only the final compositing
layer changes.

#### 2c. CSS composition layer optimization — Issue #14

Audit `will-change` and `transform: translateZ(0)` usage on scrolling containers
and canvas elements to promote the right layers to the GPU without over-promoting.

---

### 3. DSP & Audio Analysis — Issue #9

These features expand Mawimbi from a playback/recording tool toward an analysis
and composition tool.

#### 3a. Essentia.js integration — Issues #9, #99

Essentia.js (~1 MB WASM) provides production-grade audio feature extraction:
BPM detection, key estimation, onset detection, danceability, loudness
descriptors.

**Approach:**

1. Load Essentia.js WASM inside the existing spectrogram worker (or a dedicated
   analysis worker).
2. Expose an `analyseFeatures(channelData, sampleRate)` message type.
3. Return structured feature data (BPM, key, onsets) alongside spectrogram tiles.
4. Display features as overlay markers on the timeline.

#### 3b. Tempo estimation & beat tracking

Use Essentia.js beat tracker or `aubio` WASM to detect beats. Display beat grid
on the spectrogram. Prerequisite for quantised editing and the drum machine (§6a).

#### 3c. Pitch shifting & time stretching

Use `Tone.PitchShift` or a phase vocoder implementation. Consider
`SoundTouchJS` or `rubberband-web` for higher quality.

#### 3d. Effects processing

Add a per-track effects chain between `Tone.Player` and `Tone.Channel`:
`Player → EffectsChain → Channel → Analyser → Destination`.

The `Tone.Analyser` (Step 7) is already positioned to reflect post-effect audio
in the live overlay. For offline spectrograms, add a cache invalidation strategy
(invalidate on parameter change, on next play, or on explicit user action).

#### 3e. Spatial processing

Panning, stereo width, and basic 3D positioning via `Tone.Panner3D`. Simpler
L/R panning via `Tone.Panner` as a first step.

---

### 4. Recording & Overdubbing

Basic recording works (MediaRecorder via `Tone.Recorder`). These items improve
latency, precision, and workflow.

**Recommended evolution path:** Start with the current MediaRecorder approach
(already shipped), then add a hybrid timing worklet (4a-i) for precise
timestamps, and finally move to full AudioWorklet recording (4a-ii) when
sample-accurate capture is needed.

#### 4a. Recording precision

Two incremental approaches, from least to most disruptive:

**4a-i. Hybrid timing worklet (intermediate step)**

Keep MediaRecorder for audio capture but add a lightweight AudioWorklet that
only counts sample frames. This gives sample-accurate start/stop timestamps
without replacing the entire recording pipeline.

**4a-ii. Full AudioWorklet-based recording**

Replace `Tone.Recorder` (MediaRecorder) with a custom `AudioWorkletProcessor`
for sample-accurate recording. Eliminates MediaRecorder's encoding delay and
variable chunk timing.

**Architecture:**

```
RecordingProcessor.ts (AudioWorkletProcessor)
├── Ring buffer capturing raw PCM Float32Array chunks
├── Posts chunks to main thread via port.postMessage()
└── Runs on the audio thread — immune to main-thread jank

WorkletRecorder.ts (main-thread wrapper)
├── Loads worklet via audioContext.audioWorklet.addModule()
├── Creates AudioWorkletNode connected to mic source
├── Accumulates chunks into final AudioBuffer
└── Handles start/stop lifecycle
```

**`getUserMedia` constraints for low latency:**

```ts
{
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  latency: 0,
  channelCount: 1,
}
```

Disabling browser audio processing eliminates ~10–20 ms of pipeline latency.

**Tone.js tuning:** Set `Tone.context.lookAhead = 0.05` (not 0 — setting to 0
causes scheduling errors; see Tone.js issue #711). The default `0.1` adds
unnecessary latency during recording.

#### 4b. Latency compensation

Measure round-trip latency (`outputLatency + baseLatency` from the AudioContext)
and trim the recorded buffer accordingly.

**`LatencyCompensation` service design:**

```ts
// src/services/LatencyCompensation.ts
getOutputLatency(): number     // context.outputLatency
getInputLatency(): number      // estimated from getUserMedia constraints
getTotalCompensation(): number // output + input latency in seconds
trimBuffer(buffer, samples): AudioBuffer  // trim leading latency samples
```

**Formula:**

```
compensatedStartTime = transportTime - outputLatency - baseLatency
recordedBuffer = trimStart(rawBuffer, compensatedLatencySamples)
```

**Manual calibration tool:** Play a click track, record it back via speakers +
mic, cross-correlate signals to measure actual round-trip latency. Both Audacity
and Soundtrap use this pattern.

#### 4c. Input monitoring

Route microphone audio directly to speakers for zero-latency monitoring using a
`Tone.Gain` node:

```
UserMedia → monitorGain → Destination
         ↘ Recorder (for capture)
```

- Auto-detect unusable latency (>50 ms) and warn the user.
- Prevent feedback: the current code does NOT route `Tone.UserMedia` to
  `Tone.Destination`, so there is no software feedback loop. Enabling monitoring
  adds one — warn when using laptop speakers (no headphones detected).
- UI: headphone icon toggle + monitor volume slider.

#### 4d. Recording state machine

Extend `isRecording` from a boolean to a three-state enum:

```ts
type RecordingState = 'idle' | 'armed' | 'recording';
```

- **armed:** Ready to record; starts capturing on next transport play.
- **recording:** Actively capturing audio.

Coordinate `isPlaying` and `isRecording` signals in the same synchronous code
path to avoid race conditions between Transport start and Recorder start.

#### 4e. Count-in metronome

Play a 1–2 bar click before recording starts so the musician can find the tempo.
Requires beat grid from §3b for tempo-aware count-in length.

#### 4f. Punch-in / punch-out

Allow recording over a specific time range of an existing track. Requires:
- UI for setting in/out points (markers on the timeline).
- Transport-aware recording start/stop.
- Buffer splicing to merge the new recording into the existing track.

#### 4g. Multi-take recording

Record multiple takes on the same track region and let the user choose between
them. Requires a take stack data structure per region.

#### Recording references

- [W3C Web Audio Workshop: Low-latency recording](https://www.w3.org/2011/audio/)
- [Jeff TK: Web Audio latency benchmarks](https://www.jefftk.com/p/web-audio-latency)
- [Tone.js scheduling issues: #524, #644, #711](https://github.com/Tonejs/Tone.js/issues/711)
- [Audacity: Latency compensation guide](https://manual.audacityteam.org/man/latency_compensation.html)
- [Mozilla Hacks: AudioWorklet examples](https://hacks.mozilla.org/2020/02/audio-worklets-in-firefox/)

---

### 5. AI & Machine Learning — Issue #99

#### 5a. Transformers.js — in-browser audio classification

Zero-shot audio classification and speech-to-text (Whisper) using WebGPU.
Useful for auto-tagging uploaded audio (instrument, genre, speech vs. music).

#### 5b. Magenta.js — generative MIDI

Melody auto-complete, drum pattern generation, and harmonization. Requires MIDI
track support (§6b).

---

### 6. New Instruments & Features

#### 6a. Euclidean drum machine — Issue #25

Generate rhythmic patterns using the Euclidean algorithm. Requires:
- Step sequencer UI.
- Sample playback engine (can use `Tone.Player` with short samples).
- Beat grid from §3b for tempo sync.

Reference: "Euclidean Rhythms" by Jeff Holtzkener.

#### 6b. MIDI instrument support — Issue #9

Add MIDI track type alongside audio tracks. Use `Tone.Synth` / `Tone.Sampler`
for playback. Requires:
- MIDI file import/export.
- Piano roll editor component.
- MIDI clock sync with the transport.

---

### 7. Platform & UX

#### 7a. Pinch-to-zoom timeline — Issue #18

Multi-touch pinch gesture to control `pixelsPerSecond` (zoom level signal).
Desktop fallback: zoom buttons or Ctrl+scroll.

#### 7b. Internationalization — Issue #17

Use `react-i18next` with the `useTranslation` hook. Extract all user-facing
strings.

#### 7c. Favicon — Issue #22

SVG favicon with dark/light mode support.

#### 7d. Mobile app — Issue #4

React Native or a PWA approach. The audio engine (Tone.js) is browser-only, so
a PWA using the existing web stack is the lower-friction path. React Native
would require a native audio engine.

#### 7e. Desktop app — Issue #3

Electron or Tauri wrapper around the web app. Tauri is significantly smaller
(~10 MB vs ~150 MB) but requires Rust toolchain.

---

### 8. Performance & Infrastructure

#### 8a. AudioWorklet migration for real-time analysis

Replace `Tone.Analyser` (which uses `AnalyserNode` on the main audio thread)
with a custom `AudioWorkletProcessor` for lowest-latency real-time FFT. This
gives a dedicated thread for analysis and eliminates any main-thread
contention.

**Trigger:** Only if profiling reveals `AnalyserNode` as a bottleneck during
complex playback with many tracks.

#### 8b. WebAssembly for compute-heavy tasks — Issue #43

Move audio processing kernels (FFT, resampling, effects) to WASM for near-native
performance. Candidate libraries:
- **KissFFT** (~50 KB WASM) — FFT only.
- **Essentia.js** (~1 MB WASM) — full analysis suite.
- **Rubberband** — time stretching / pitch shifting.

Can be loaded inside existing Web Workers for off-thread execution.

#### 8c. Service layer reorganisation

From MIGRATION.md Phase 8: split the monolithic `AudioService` singleton into
focused services:
- `TransportService` — playback control.
- `MixerService` — channel management.
- `RecordingService` — mic input and recording.
- `AnalysisService` — offline and real-time analysis.

**Trigger:** When `AudioService` grows beyond ~400 lines or gains a fourth
responsibility.

#### 8d. Memory profiling

Profile GPU memory and heap usage with 5+ tracks of 10-minute audio. Validate
that `ImageBitmap` tiles are properly closed on invalidation and that the worker
doesn't hold stale references.

---

## Suggested Priority Order

A recommended sequence that maximises user-visible impact while respecting
dependencies between items.

| Priority | Item | Ref | Rationale |
|----------|------|-----|-----------|
| 1 | Safari spectrogram fix | §1a, #27 | Bug affecting a major browser |
| 2 | Pinch-to-zoom | §7a, #18 | High-visibility UX improvement, low effort |
| 3 | Effects processing | §3d, #9 | Unlocks creative use cases |
| 4 | AudioWorklet recording | §4a | Precision recording for overdubs |
| 5 | Latency compensation | §4b | Completes the recording story |
| 6 | Essentia.js (BPM/key) | §3a, #9 | Popular feature request |
| 7 | Dual-band FFT | §1b, #26 | Spectrogram quality improvement |
| 8 | Euclidean drum machine | §6a, #25 | Fun, self-contained feature |
| 9 | Canvas perf / WebGL | §2b, #29 | Scaling to many tracks |
| 10 | Remaining items | §5–§8 | As needed based on user feedback |

---

## Issue Cross-Reference

| Issue | Title | Addressed in |
|-------|-------|--------------|
| #3 | Build desktop app | §7e |
| #4 | Build mobile app | §7d |
| #5 | Web Audio API references | §3, §8a (superseded by implementation) |
| #9 | DSP ideas | §3a–§3e, §6b |
| #14 | Optimize CSS composition layers | §2c |
| #17 | Add internationalization | §7b |
| #18 | Pinch to zoom timeline | §7a |
| #22 | Create a nice favicon | §7c |
| #25 | Create Euclidean drum machine | §6a |
| #26 | Improve spectrogram resolution | §1b |
| #27 | Fix spectrogram in Safari | §1a |
| #29 | Optimize canvas rendering | §2a–§2d |
| #43 | Experiment with WebAssembly | §8b |
| #99 | Web Audio improvements | §3a, §5a, §5b |

---

## Superseded Documents

The following documents are now fully captured in this file and can be archived
or deleted:

| File | Status |
|------|--------|
| `MODERNIZATION_PLAN.md` | 100% complete — all targets shipped |
| `MIGRATION.md` | Phases 1–7 complete — Phase 8 captured in §8a, §8c |
| `VISUALIZATION_PLAN.md` | Superseded by `UNIFIED_VISUALIZATION_PLAN.md` |
| `UNIFIED_VISUALIZATION_PLAN.md` | All 11 steps complete — future items in §1, §2 |
| `RECORDING_PLAN.md` | Research complete — future items in §4 |
| `docs/audio-visualization-research.md` | Research complete — findings implemented |
| `docs/research/low-latency-overdubbing.md` | Research complete — future items in §4 |
| `docs/step-11-analysis.md` | Analysis complete — Step 11 shipped, future items in §1a |
