# Low-Latency Overdubbing in Mawimbi: Research & Implementation Plan

## 1. Problem Statement

Mawimbi needs **simultaneous playback and recording** (overdubbing): a user plays back existing tracks while recording a new track from their microphone, and the recorded audio is aligned in time with the playback. Today, recording and playback are independent operations — pressing record does not start the transport, and there is no latency compensation.

---

## 2. Current Architecture Analysis

### 2.1 How recording works today

1. User clicks the microphone button in `Toolbar` → toggles `isRecording` state in `Workstation`.
2. The `useMicrophone` effect in `workstationEffects.ts` reacts:
   - **Start**: Opens `Tone.UserMedia` (calls `getUserMedia`), then connects it to a `Tone.Recorder` and calls `recorder.start()`.
   - **Stop**: Calls `recorder.stop()` → gets a `Blob` → converts to `ArrayBuffer` → `audioService.createTrack()` decodes it, creates a `Tone.Player` + `Tone.Channel`, and adds the track to the project.
3. Recording is **completely independent of playback** — `Tone.Transport` is not started/stopped as part of the recording flow.

### 2.2 How playback works today

1. `isPlaying` signal triggers `useTransportBridge` → calls `audioService.startPlayback()` / `pausePlayback()`.
2. These call `Tone.Transport.start()` / `.pause()`.
3. Each track's `Tone.Player` is synced to Transport via `.sync().start(0)` — all players start from the transport origin.
4. A `Tone.Meter` on `Tone.getDestination()` drives the loudness signal.

### 2.3 Key components

| Component | Role | File |
|---|---|---|
| `AudioService` (singleton) | Owns `Mixer`, `MicrophoneUserMedia`, `Tone.Recorder`, and `AudioSourceRepository` | `src/services/AudioService.ts` |
| `Mixer` | Creates/manages `Tone.Player` + `Tone.Channel` per track, loudness metering | `src/services/Mixer.ts` |
| `MicrophoneUserMedia` | Wraps `Tone.UserMedia` (microphone access), meter logging | `src/services/MicrophoneUserMedia.ts` |
| `useTransportBridge` | Bridges `isPlaying` signal → `Tone.Transport.start()/pause()` | `src/hooks/useTransportBridge.ts` |
| `useAudioBridge` | Bridges track signals (volume/mute/solo) → `AudioChannel` | `src/hooks/useAudioBridge.ts` |
| `useMicrophone` | Orchestrates record start/stop and track creation | `src/components/workstation/workstationEffects.ts` |
| `Toolbar` | Play/pause, record, mixer toggle buttons | `src/components/workstation/Toolbar.tsx` |

### 2.4 What's missing for overdubbing

1. **No coordinated record + playback**: Recording doesn't start the transport; the user must separately click play and record.
2. **No latency compensation**: The recorded audio is not shifted to account for input/output latency.
3. **`Tone.Recorder` timing imprecision**: `Tone.Recorder` wraps the `MediaRecorder` API, which does _not_ guarantee sample-accurate start timing (see [Tone.js issue #524](https://github.com/Tonejs/Tone.js/issues/524) and [issue #644](https://github.com/Tonejs/Tone.js/issues/644)). Leading silence is trimmed unpredictably, breaking overdub alignment.
4. **No input monitoring**: The user cannot hear themselves during recording. The mic feeds into `Tone.Recorder` only, not into `Tone.Destination`.
5. **No Tone.js latency tuning**: The app uses default `lookAhead` (0.1s) and `latencyHint` ("interactive") without explicit configuration.

---

## 3. Web Audio API Latency Fundamentals

### 3.1 Latency components

Total round-trip latency = **input latency** + **processing latency** + **output latency**.

| Property | What it measures | Typical value |
|---|---|---|
| `AudioContext.baseLatency` | Processing latency internal to the AudioContext graph | ~0 (Firefox), ~0.01s (Chrome) |
| `AudioContext.outputLatency` | OS/hardware output latency (speakers, DAC) | ~0.015s (wired), ~0.18s (Bluetooth) |
| Input latency | ADC + OS buffering for microphone input | ~0.005–0.02s (varies by device) |

The Web Audio spec does not expose **input latency** directly. The `MediaStreamSourceNode` may introduce additional undocumented latency ([W3C workshop talk by Ulf Hammarqvist from Soundtrap](https://www.w3.org/2021/03/media-production-workshop/talks/ulf-hammarqvist-audio-latency.html)).

### 3.2 `latencyHint` constructor option

```js
new AudioContext({ latencyHint: 'interactive' })  // lowest latency (default)
new AudioContext({ latencyHint: 'playback' })      // power-efficient, higher latency
new AudioContext({ latencyHint: 0 })               // explicit: as low as possible
```

Setting `latencyHint: 0` has been shown to reduce Chrome's buffer size beyond the default "interactive" setting ([Jeff TK benchmarks](https://www.jefftk.com/p/audioworklet-latency-firefox-vs-chrome)).

### 3.3 Achievable latencies in browsers

| Platform | Round-trip latency | Source |
|---|---|---|
| Firefox (desktop) | ~14ms | Jeff TK benchmarks |
| Chrome (desktop) | 19–41ms (inconsistent) | Jeff TK benchmarks |
| Reaper (native DAW, reference) | ~11ms | Jeff TK benchmarks |
| Soundtrap (browser DAW) | ~30ms best-case | W3C workshop |

**30ms is "passable for monitoring but not great"** per Soundtrap's engineering team. The target for competitive native performance is 10ms. For overdub alignment (not real-time monitoring), the absolute latency matters less — what matters is **knowing the latency accurately** so it can be compensated.

---

## 4. Recording Approaches Compared

### 4.1 `Tone.Recorder` (current — wraps `MediaRecorder`)

**Pros:**
- Already in the codebase
- Simple API: `start()` / `stop()` → `Blob`
- Handles encoding (WebM/Opus in Chrome)

**Cons:**
- **No sample-accurate timing**: `MediaRecorder.start()` does not guarantee immediate recording start — it can be "a quantum or two off" ([W3C workshop](https://www.w3.org/2021/03/media-production-workshop/talks/ulf-hammarqvist-audio-latency.html))
- **Unpredictable silence trimming**: Subsequent recordings lose leading silence, breaking overdub alignment ([Tone.js issue #524](https://github.com/Tonejs/Tone.js/issues/524))
- **No timestamp data**: You cannot know exactly when the first sample was captured
- **Compressed output**: Encoded as Opus/WebM; requires re-decoding to get `AudioBuffer`
- **Variable latency**: Data delivery timing is browser-dependent

**Verdict: Unsuitable for aligned overdubbing.**

### 4.2 `AudioWorklet`-based PCM capture (recommended)

**Pros:**
- Runs on a **dedicated audio thread** — lowest possible latency
- Gives access to **raw PCM Float32 samples** with 128-sample (2.9ms at 44.1kHz) granularity
- **`currentFrame` / `currentTime`** available in the processor for precise timestamping
- Can integrate with Tone.js audio graph (connect to any Tone.js node)
- Full control over buffering and data flow

**Cons:**
- More complex to implement (worklet processor file, message port communication)
- Need to handle WAV encoding or work with raw `Float32Array` buffers
- Must be served from a separate `.js` file (or inline via Blob URL)

**Verdict: Best option for sample-accurate recording with known timing.**

### 4.3 `MediaRecorder` on a `MediaStreamDestination` (hybrid)

Connect both playback output and mic input to a `MediaStreamDestination`, record the mix. This captures what the user hears but loses individual track separation.

**Verdict: Not suitable — we need the recording as a separate track.**

### 4.4 `Tone.Offline` (internal rendering)

Record synth/effect output offline without microphone input. Useful for bouncing existing tracks but not for live mic recording.

**Verdict: Not applicable to live microphone recording.**

---

## 5. Recommended Solution: AudioWorklet-Based Recording with Latency Compensation

### 5.1 High-level architecture

```
              ┌──────────────────────────────────┐
              │         Tone.Transport            │
              │   (schedules all playback)        │
              └──────────┬───────────────────────┘
                         │
           ┌─────────────┼─────────────────┐
           │             │                 │
    ┌──────▼──────┐ ┌────▼─────┐   ┌──────▼──────┐
    │ Tone.Player │ │Tone.Player│   │ Tone.Player │  (existing tracks)
    │  + Channel  │ │ + Channel│   │  + Channel  │
    └──────┬──────┘ └────┬─────┘   └──────┬──────┘
           │             │                 │
           └─────────────┼─────────────────┘
                         │
                         ▼
                Tone.Destination ──► Speakers
                         ▲
                         │ (optional input monitoring)
                         │
    ┌────────────────────┤
    │                    │
    │  getUserMedia ─► MediaStreamSourceNode
    │                    │
    │                    ▼
    │            AudioWorkletNode
    │           (RecordingProcessor)
    │                    │
    │          ┌─────────┼──────────┐
    │          │ postMessage        │ connect
    │          ▼                    ▼
    │   Main thread:         Tone.Destination
    │   accumulate PCM       (input monitoring)
    │   Float32 chunks
    │          │
    │          ▼
    │   On stop: assemble
    │   AudioBuffer, apply
    │   latency offset,
    │   create track
    └────────────────────────────────────────────
```

### 5.2 Recording flow (overdub)

1. User clicks **Record** → app simultaneously:
   a. Opens microphone (`getUserMedia` with optimized constraints)
   b. Creates `MediaStreamSourceNode` → connects to `AudioWorkletNode` ("RecordingProcessor")
   c. Optionally connects `MediaStreamSourceNode` → `Tone.Destination` (input monitoring)
   d. Captures `Tone.Transport.seconds` as `recordStartTime`
   e. Starts `Tone.Transport` (begins playback of existing tracks)

2. The `RecordingProcessor` (AudioWorklet):
   - Receives 128-sample blocks via `process()`
   - Posts `Float32Array` chunks to the main thread via `MessagePort`
   - Main thread accumulates chunks into a growing buffer

3. User clicks **Stop** → app simultaneously:
   a. Captures `Tone.Transport.seconds` as `recordStopTime`
   b. Pauses `Tone.Transport`
   c. Disconnects and cleans up the `AudioWorkletNode`
   d. Assembles accumulated PCM chunks into an `AudioBuffer`
   e. Applies latency compensation offset (see 5.3)
   f. Creates the new track via `audioService.createTrack()`

### 5.3 Latency compensation

The recorded audio needs to be shifted backwards in time by the round-trip latency so it aligns with what the user was hearing when they performed.

```
Compensation offset = baseLatency + outputLatency + estimatedInputLatency
```

**Practical approach:**

1. **Read `AudioContext.baseLatency` and `AudioContext.outputLatency`** at recording start. These are the output-side latencies the browser knows about.

2. **Estimate input latency.** The Web Audio API does not expose this directly. A reasonable default is one audio processing quantum (~2.9ms at 44.1kHz / 128 samples). This can be made user-configurable.

3. **Apply the offset** by trimming the start of the recorded buffer:
   ```ts
   const offsetSamples = Math.round(compensationSeconds * sampleRate);
   // Trim offsetSamples from the beginning of the recorded buffer
   ```

4. **Set the track's start position** to `recordStartTime` (the transport time when recording began), so the new `Tone.Player` starts at the right point via `.sync().start(recordStartTime)`.

5. **Optional: Calibration tone.** For users who need tighter alignment, provide a calibration tool: play a click → record it back → measure the offset automatically. This is how Audacity and other DAWs handle it ([Audacity latency compensation guide](https://support.audacityteam.org/troubleshooting/solving-recording-problems/latency-compensation)).

### 5.4 Input monitoring

To let the user hear themselves while recording (with effects potentially applied later):

- Connect the `MediaStreamSourceNode` to `Tone.Destination` (direct monitoring)
- This adds no extra latency beyond the `outputLatency` — the audio goes straight to speakers

**Feedback prevention:** If the user is using speakers instead of headphones, direct monitoring will create a feedback loop. Options:
- Default monitoring to **off**
- Detect output device type if possible
- Add a "monitor" toggle to the UI

### 5.5 `getUserMedia` constraints for low latency

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    latency: 0,
    channelCount: 1,
  },
});
```

Disabling browser audio processing (`echoCancellation`, `noiseSuppression`, `autoGainControl`) removes hidden processing latency. Setting `latency: 0` requests the smallest possible buffer.

### 5.6 Tone.js context configuration

```ts
Tone.setContext(
  new Tone.Context({
    latencyHint: 'interactive',
    lookAhead: 0.05,  // reduce from default 0.1s
  })
);
```

**Why not `lookAhead: 0`?** Setting `lookAhead` to 0 can cause scheduling errors under load with many concurrent players ([Tone.js issue #711](https://github.com/Tonejs/Tone.js/issues/711)). A value of 0.05s halves the default latency while maintaining scheduling reliability. This is a tunable parameter.

---

## 6. Implementation Plan

### Phase 1: AudioWorklet Recording Infrastructure

**New files to create:**

| File | Purpose |
|---|---|
| `src/services/RecordingProcessor.ts` | AudioWorklet processor (compiled to separate JS, or inline via Blob URL) |
| `src/services/WorkletRecorder.ts` | Main-thread class managing the AudioWorklet lifecycle, PCM accumulation, and buffer assembly |

**Changes to existing files:**

| File | Change |
|---|---|
| `AudioService.ts` | Replace `Tone.Recorder` with `WorkletRecorder`. Add `startOverdub(transportTime)` and `stopOverdub()` methods that coordinate recording + transport. Expose latency compensation config. |
| `MicrophoneUserMedia.ts` | Add `getUserMedia` constraint options (disable echo cancellation, etc.). Expose the raw `MediaStream` for AudioWorklet connection (currently only exposes `Tone.UserMedia`). |

**RecordingProcessor (AudioWorklet):**
```ts
// RecordingProcessor.ts — runs on audio thread
class RecordingProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (input.length > 0) {
      // Copy input data and send to main thread
      const channelData = new Float32Array(input[0]);
      this.port.postMessage({ samples: channelData }, [channelData.buffer]);
    }
    return true; // keep alive
  }
}
registerProcessor('recording-processor', RecordingProcessor);
```

**WorkletRecorder (main thread):**
```ts
class WorkletRecorder {
  private chunks: Float32Array[] = [];
  private workletNode: AudioWorkletNode | null = null;

  async start(stream: MediaStream, audioContext: AudioContext): Promise<void> {
    await audioContext.audioWorklet.addModule(processorUrl);
    const source = audioContext.createMediaStreamSource(stream);
    this.workletNode = new AudioWorkletNode(audioContext, 'recording-processor');
    this.workletNode.port.onmessage = (e) => {
      this.chunks.push(e.data.samples);
    };
    source.connect(this.workletNode);
  }

  stop(sampleRate: number): AudioBuffer {
    // Assemble chunks into AudioBuffer
    const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const buffer = new AudioContext().createBuffer(1, totalLength, sampleRate);
    const channelData = buffer.getChannelData(0);
    let offset = 0;
    for (const chunk of this.chunks) {
      channelData.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    return buffer;
  }
}
```

### Phase 2: Overdub Orchestration

**Changes to `AudioService.ts`:**

Add methods for coordinated overdub:

```ts
async startOverdub(): Promise<void> {
  const stream = await this.microphone.openRaw(); // new method returning MediaStream
  this.recordStartTime = Tone.Transport.seconds;
  await this.workletRecorder.start(stream, Tone.context.rawContext);
  Tone.Transport.start(); // start playback simultaneously
}

async stopOverdub(): Promise<TrackCreationResult> {
  Tone.Transport.pause();
  const audioBuffer = this.workletRecorder.stop(Tone.context.sampleRate);
  const compensated = this.applyLatencyCompensation(audioBuffer);
  return this.createTrackFromBuffer(compensated, this.recordStartTime);
}
```

**Changes to `Mixer.ts`:**

Add support for tracks that start at an offset (not from 0):

```ts
createChannel(trackId: string, audioBuffer: AudioBuffer, normalizationGainDb = 0, startOffset = 0): void {
  const player = new Tone.Player(audioBuffer).sync().start(startOffset);
  // ... rest unchanged
}
```

This is critical — overdubbed tracks don't start at time 0; they start at whatever transport position recording began.

**Changes to `workstationEffects.ts` / `useMicrophone`:**

Update the recording effect to call the new overdub methods instead of the old `startRecording` / `stopRecording`.

### Phase 3: UI Integration

**Changes to `Toolbar.tsx`:**

- When record is toggled ON: start overdub (record + play)
- When record is toggled OFF: stop overdub (stop recording, optionally continue playing)
- Consider a **count-in** (1-2 bar metronome click before recording starts) for musical timing

**Changes to `Workstation.tsx`:**

- The `isRecording` state may need to become an enum: `'idle' | 'armed' | 'recording'`
- "Armed" = ready to record on next play, vs "recording" = actively capturing

**New UI element — Input Monitor toggle:**

- Small button or indicator showing mic input level during recording
- Toggle for direct monitoring (hear yourself through speakers)

### Phase 4: Latency Compensation & Calibration

**New file: `src/services/LatencyCompensation.ts`**

```ts
export function getOutputLatency(): number {
  const ctx = Tone.context.rawContext as AudioContext;
  return (ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0);
}

export function getEstimatedInputLatency(): number {
  // One render quantum as a conservative estimate
  return 128 / Tone.context.sampleRate;
}

export function getTotalCompensation(userOffset = 0): number {
  return getOutputLatency() + getEstimatedInputLatency() + userOffset;
}

export function trimBuffer(buffer: AudioBuffer, trimSeconds: number): AudioBuffer {
  const trimSamples = Math.round(trimSeconds * buffer.sampleRate);
  const newLength = buffer.length - trimSamples;
  if (newLength <= 0) return buffer;

  const trimmed = new OfflineAudioContext(
    buffer.numberOfChannels, newLength, buffer.sampleRate
  ).createBuffer(buffer.numberOfChannels, newLength, buffer.sampleRate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    trimmed.getChannelData(ch).set(
      buffer.getChannelData(ch).subarray(trimSamples)
    );
  }
  return trimmed;
}
```

**Optional calibration tool (future):**
Play a reference click through speakers → record it → measure the time offset between the scheduled click and the recorded click → store as `userOffset`.

---

## 7. Impact on Existing Architecture

### What stays the same
- `Tone.Transport` scheduling model for playback
- `Tone.Player` + `Tone.Channel` chain per track
- Signal-based state management (transport, track, focus signals)
- `useAudioBridge` / `useTransportBridge` hooks
- Project reducer, track metadata management
- WaveSurfer.js visualization
- Mixer drag-and-drop reordering

### What changes
| Area | Current | New |
|---|---|---|
| Recording engine | `Tone.Recorder` (MediaRecorder) | `WorkletRecorder` (AudioWorklet) |
| `MicrophoneUserMedia` | Only exposes `Tone.UserMedia` | Also exposes raw `MediaStream` for worklet connection |
| `AudioService.startRecording/stopRecording` | Independent of transport | Replaced by `startOverdub/stopOverdub` that coordinate with transport |
| `Mixer.createChannel` | All tracks start at offset 0 | Supports arbitrary start offset for overdubbed tracks |
| `useMicrophone` effect | Simple record start/stop | Orchestrates overdub flow (record + play + stop) |
| Toolbar record button | Toggles independent recording | Toggles overdub (record + play simultaneously) |

### What's NOT needed (avoiding over-engineering)
- No need to change the routing/mixing architecture
- No need to replace Tone.js with raw Web Audio API for playback
- No need for a ring buffer or SharedArrayBuffer (simple postMessage is sufficient for recording at normal speeds)
- No need for WebCodecs or custom encoding — raw PCM → AudioBuffer is fine for in-memory tracks

---

## 8. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| AudioWorklet not supported in target browser | Low (supported in all modern browsers since ~2020) | Feature-detect; fall back to `Tone.Recorder` with a warning about alignment |
| `lookAhead` reduction causes scheduling glitches | Medium | Keep at 0.05s, not 0; test with many concurrent tracks |
| Latency compensation offset is wrong | Medium | Make offset user-configurable; provide calibration tool |
| Input monitoring causes feedback | Medium | Default monitoring to off; add toggle |
| Mobile browser audio thread issues | Medium-High | Test on mobile; accept higher latency on mobile |
| `addModule()` requires separate JS file / CSP issues | Low | Use Blob URL pattern for inline worklet code |

---

## 9. References

- [MDN: AudioContext.baseLatency](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency)
- [MDN: AudioContext.outputLatency](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency)
- [MDN: AudioContext constructor (latencyHint)](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext)
- [W3C Workshop: Audio latency in browser-based DAWs (Ulf Hammarqvist / Soundtrap)](https://www.w3.org/2021/03/media-production-workshop/talks/ulf-hammarqvist-audio-latency.html)
- [web.dev: Synchronize audio and video playback](https://web.dev/articles/audio-output-latency)
- [web.dev: How to process audio from the user's microphone (AudioWorklet)](https://web.dev/patterns/media/microphone-process)
- [Jeff TK: AudioWorklet latency Firefox vs Chrome](https://www.jefftk.com/p/audioworklet-latency-firefox-vs-chrome)
- [Mozilla Hacks: High-performance Web Audio with AudioWorklet](https://hacks.mozilla.org/2020/05/high-performance-web-audio-with-audioworklet-in-firefox/)
- [AudioWorklet recorder example (GitHub Gist)](https://gist.github.com/flpvsk/047140b31c968001dc563998f7440cc1)
- [Chrome Web Audio Samples: AudioWorklet](https://googlechromelabs.github.io/web-audio-samples/audio-worklet/)
- [Tone.js Performance Wiki](https://github.com/Tonejs/Tone.js/wiki/Performance)
- [Tone.js Context docs (lookAhead, latencyHint)](https://tonejs.github.io/docs/14.7.77/Context)
- [Tone.js Recorder docs](https://tonejs.github.io/docs/14.7.77/Recorder)
- [Tone.js issue #524: Silence trimming breaks overdub alignment](https://github.com/Tonejs/Tone.js/issues/524)
- [Tone.js issue #644: UserMedia-MediaRecorder integration](https://github.com/Tonejs/Tone.js/issues/644)
- [Tone.js issue #711: lookAhead=0 causes errors with many players](https://github.com/Tonejs/Tone.js/issues/711)
- [Tone.js issue #396: Latency with external MIDI keys](https://github.com/Tonejs/Tone.js/issues/396)
- [Audacity: Latency compensation guide](https://support.audacityteam.org/troubleshooting/solving-recording-problems/latency-compensation)
- [Chrome blog: Audio worklet design patterns](https://developer.chrome.com/blog/audio-worklet-design-pattern/)
