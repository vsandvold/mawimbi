# Low-Latency Recording with Simultaneous Playback in Mawimbi

## Research Summary & Technical Plan

---

## 1. The Problem

Mawimbi currently supports recording from the microphone and playing back tracks, but **not simultaneously**. The `useMicrophone` effect in `workstationEffects.ts` starts recording when the user presses record and stops when they press it again, at which point the recorded audio is decoded and added as a new track. During recording, playback is not started — the Transport is not involved.

For a useful music creation workflow, Mawimbi needs **overdub recording**: the user hears existing tracks playing while recording a new track on top. When recording stops, the new track must be time-aligned with the existing material so that everything plays back in sync.

This is the single hardest problem in browser-based audio production, and it's worth understanding the full landscape before choosing an approach.

---

## 2. Sources of Latency in Web Audio

There are several independent sources of latency that compound in a record-while-playing scenario:

### 2.1 Input Latency
The time from a sound wave hitting the microphone to the samples being available inside the Web Audio graph. This is determined by the OS audio subsystem, the hardware driver, and the browser's `MediaStream` pipeline. It is **not directly exposed** by any Web API — the `MediaStreamTrack.getSettings().latency` property exists but is unreliable and inconsistently implemented.

### 2.2 Processing Latency (Web Audio Block Size)
The Web Audio API processes in fixed 128-sample blocks (called a "render quantum"). At 44.1 kHz that's ~2.9 ms per block. This is unavoidable and adds a small fixed delay within the audio graph.

### 2.3 Output Latency
The time from audio leaving the `AudioDestinationNode` to reaching the speakers/headphones. This **is** exposed via `AudioContext.outputLatency` (Chrome, Firefox — not Safari) and `AudioContext.baseLatency`. Bluetooth headphones can add 150–300 ms on top.

### 2.4 Tone.js lookAhead
Tone.js adds its own scheduling lookahead (default `0.1` seconds = 100 ms) on top of `context.currentTime`. This is configurable via `Tone.context.lookAhead`. For playback-only use this is fine; for recording alignment it needs to be accounted for.

### 2.5 MediaRecorder Start Uncertainty
`Tone.Recorder` wraps the browser's `MediaRecorder` API. The Tone.js docs explicitly state: *"Unlike the rest of Tone.js, this module does not offer any sample-accurate scheduling because it is not a feature of the MediaRecorder API."* When you call `recorder.start()`, there is no guarantee about precisely when recording actually begins relative to the audio context timeline — it could be off by one or two render quanta.

### 2.6 Soundtrap / Spotify's Assessment
Ulf Hammarqvist from Soundtrap (Spotify's browser DAW) presented at a W3C workshop in 2021 that the best-case round-trip latency they achieve is approximately **30 ms**, and that 10 ms would be a good target but isn't currently achievable in browsers. He identified two core challenges:

1. Knowing the **actual** round-trip latency (input + processing + output).
2. Knowing **exactly when** recorded data arrived relative to the playback timeline.

He noted that `MediaRecorder` provides no timing guarantees, and that the only precise alternative is a custom `AudioWorklet` — but then "you have to do everything."

---

## 3. Tone.js Capabilities for This Use Case

### 3.1 What Works Well
- **`Tone.Transport`** — Already used in Mawimbi. All `Tone.Player` instances are `.sync()`'d to Transport and start at position 0. Starting Transport starts all tracks simultaneously with sample-accurate scheduling.
- **`Tone.UserMedia`** — Already used in Mawimbi via `MicrophoneUserMedia`. Opens the mic and pipes it into the Web Audio graph.
- **`Tone.Recorder`** — Already used in Mawimbi. Wraps `MediaRecorder` for encoding audio from any connected node.
- **`Tone.Channel`** — Already used for per-track volume/mute/solo routing.

### 3.2 What Doesn't Work (for this use case)
- **`Tone.Recorder` has no timing guarantees** — You cannot know at what exact `Transport.seconds` value recording began.
- **`Tone.Recorder` cannot be synced to Transport** — Unlike `Tone.Player`, `Tone.Recorder` does not have a `.sync()` method.
- **No latency compensation built in** — Tone.js does not provide round-trip latency measurement or automatic alignment of recorded material.

### 3.3 Tone.js Performance Tuning
For recording scenarios, two Tone.js settings are critical:

```typescript
// Reduce lookAhead for lower latency during recording
Tone.context.lookAhead = 0.01; // 10ms instead of default 100ms

// Or create a context optimized for interactivity
Tone.setContext(new Tone.Context({ latencyHint: "interactive" }));
```

The `"interactive"` latency hint tells the browser to minimize output latency at the cost of CPU. This is the right choice during recording. For pure playback, `"playback"` or `"balanced"` would save battery.

---

## 4. Three Approaches, Ranked

### Approach A: MediaRecorder + Timestamp Bookkeeping (Recommended Starting Point)

**How it works:** Continue using `Tone.Recorder` (MediaRecorder) for recording, but coordinate it with Transport playback and apply latency compensation after recording stops.

**Recording flow:**
1. User presses Record
2. Open microphone (`Tone.UserMedia.open()`)
3. Connect mic → `Tone.Recorder`
4. Capture `startTimestamp = Tone.Transport.seconds` (or `Tone.context.currentTime`)
5. Call `recorder.start()` and `Tone.Transport.start()` together
6. User hears existing tracks playing through speakers/headphones
7. User sings/plays instrument — mic captures it
8. User presses Stop
9. Capture `stopTimestamp = Tone.Transport.seconds`
10. `Tone.Transport.pause()`
11. `const blob = await recorder.stop()`
12. Decode blob → `AudioBuffer`
13. Create a new track with the recorded audio
14. **Offset the new `Tone.Player` start position** by the measured/estimated latency

**Latency compensation:**
```typescript
// Estimate total round-trip latency
const outputLatency = Tone.context.rawContext.outputLatency ?? 0;
const baseLatency = Tone.context.rawContext.baseLatency ?? 0;
const lookAhead = Tone.context.lookAhead;
const estimatedInputLatency = 0.005; // ~5ms educated guess
const totalLatency = outputLatency + baseLatency + lookAhead + estimatedInputLatency;

// When creating the recorded track's Player:
player.sync().start(0, totalLatency);
// The `offset` parameter skips the first `totalLatency` seconds of the recording,
// effectively shifting it earlier to compensate for the round-trip delay.
```

Alternatively, instead of trimming the recording start, you can delay its start position:
```typescript
// Shift the recording forward to where it actually "belongs" in the timeline
const compensatedStartTime = startTimestamp - totalLatency;
player.sync().start(compensatedStartTime);
```

**Pros:**
- Minimal changes to existing architecture — keeps `Tone.Recorder`, `Tone.UserMedia`, and existing `Mixer.createChannel` pattern
- Works today with current Tone.js 14 API
- Produces compressed audio (WebM/Opus) which is space-efficient
- Good enough for most use cases (10–50ms alignment error)

**Cons:**
- Latency compensation is an estimate, not sample-accurate
- `MediaRecorder` start timing is non-deterministic (typically 1–3 render quanta of jitter)
- No input monitoring (user doesn't hear themselves through the app during recording, only through acoustic bleed or OS-level monitoring)
- Safari support for `MediaRecorder` is limited

**Changes needed in Mawimbi:**

| File | Change |
|---|---|
| `AudioService.ts` | Add `startOverdubRecording()` that starts both Transport and Recorder together, captures timestamps |
| `AudioService.ts` | Add `stopOverdubRecording()` that stops both, applies latency compensation when creating the new track |
| `Mixer.ts` | Add `createChannel()` overload that accepts a start offset for time-shifted playback |
| `MicrophoneUserMedia.ts` | Remove `console.log` meter polling; add monitoring toggle |
| `workstationEffects.ts` | Update `useMicrophone` to call overdub-aware methods; start Transport on record |
| `transportSignals.ts` | Add `isRecording` signal to coordinate Transport state during recording |
| `Toolbar.tsx` | Ensure record button also starts playback (visual indicator) |

---

### Approach B: AudioWorklet-Based Recording (Most Precise)

**How it works:** Replace `Tone.Recorder` with a custom `AudioWorkletProcessor` that captures raw PCM samples with frame-level timing precision. The worklet runs on the audio thread and knows exactly which render quantum it's processing.

**Architecture:**

```
Mic → Tone.UserMedia → AudioWorkletNode (records raw Float32 samples)
                                ↓
                    postMessage() → Main thread
                                ↓
                    Accumulate in Float32Array
                                ↓
                    On stop: create AudioBuffer directly
```

**AudioWorklet processor (`recorder-worklet.js`):**
```javascript
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.startFrame = 0;
    this.port.onmessage = (e) => {
      if (e.data.command === 'start') {
        this.recording = true;
        this.startFrame = currentFrame; // sample-accurate!
      }
      if (e.data.command === 'stop') {
        this.recording = false;
        this.port.postMessage({ done: true, startFrame: this.startFrame });
      }
    };
  }

  process(inputs) {
    if (this.recording && inputs[0].length > 0) {
      // Send raw samples to main thread
      this.port.postMessage({
        samples: inputs[0][0].slice() // copy to avoid detachment
      });
    }
    return true;
  }
}
registerProcessor('recorder-processor', RecorderProcessor);
```

**Pros:**
- Sample-accurate start/stop timing — `currentFrame` is exact
- No MediaRecorder jitter or encoding delay
- Raw PCM gives maximum quality
- Can easily implement input monitoring (route worklet output to destination)
- Full control over the recording pipeline

**Cons:**
- Significantly more code — need worklet file, ring buffer, Float32 accumulation, manual AudioBuffer construction
- Raw PCM uses more memory than compressed audio (a 3-minute mono recording at 44.1 kHz = ~15 MB)
- AudioWorklet has known issues on mobile browsers (crackling on Android, glitches during UI interaction on iOS)
- Need to handle the worklet module loading (Vite configuration for the worker file)
- Creates a parallel recording system alongside Tone.js rather than using Tone's built-in facilities

**Changes needed in Mawimbi:**

| File | Change |
|---|---|
| New: `src/services/RecorderWorklet.ts` | AudioWorkletNode wrapper class |
| New: `public/recorder-processor.js` | AudioWorkletProcessor implementation |
| `AudioService.ts` | Replace `Tone.Recorder` with worklet-based recorder |
| `AudioService.ts` | Add worklet registration on startup |
| `Mixer.ts` | Accept raw `AudioBuffer` in `createChannel()` (already does) |
| `vite.config.ts` | Possibly configure worker file handling |
| All files from Approach A | Same Transport coordination changes |

---

### Approach C: Hybrid — MediaRecorder for Capture, Worklet for Timing (Best of Both)

**How it works:** Use `Tone.Recorder` (MediaRecorder) for the actual audio capture and encoding, but attach a lightweight AudioWorklet to the same mic input purely to track precise timing. The worklet counts frames but doesn't store audio data.

**Architecture:**

```
Mic → Tone.UserMedia ─┬→ Tone.Recorder (captures audio)
                       └→ TimingWorkletNode (counts frames, reports start/stop frame)
```

```javascript
class TimingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (e) => {
      if (e.data === 'mark') {
        this.port.postMessage({ frame: currentFrame });
      }
    };
  }
  process() { return true; }
}
```

When recording starts, send `'mark'` to get the exact frame. When recording stops, send another `'mark'`. The difference gives you the precise duration and start position relative to `context.currentTime`, which you can map to Transport time.

**Pros:**
- Best timing accuracy while keeping MediaRecorder's compression benefits
- Lightweight worklet (no audio data transfer overhead)
- Minimal changes to existing recording pipeline
- Graceful degradation: if worklet fails to load, fall back to Approach A

**Cons:**
- Two parallel systems for one operation (slightly more complexity)
- Still subject to MediaRecorder's start jitter, though the timing worklet can measure it
- Worklet registration still required

---

## 5. Recommendation for Mawimbi

### Start with Approach A, evolve to Approach C

**Phase 1 (Approach A):** Get overdub recording working end-to-end with MediaRecorder + timestamp bookkeeping. This requires the fewest changes to the existing architecture and delivers the core feature. The main work is in `AudioService.ts` and `workstationEffects.ts` — adding coordinated Transport+Recorder start/stop with timestamp capture and latency offset calculation.

**Phase 2 (Approach C):** If alignment precision becomes a problem in practice, add the timing worklet alongside the existing MediaRecorder pipeline to get frame-accurate timing without replacing the recording system.

**Phase 3 (Approach B):** If MediaRecorder proves problematic (Safari compat, mobile crackling, quality needs), migrate to full AudioWorklet recording. This is the most work but gives maximum control.

---

## 6. Detailed Implementation Plan (Phase 1)

### 6.1 Configure AudioContext for Low Latency

In `src/index.tsx` or wherever `AudioService.startAudio()` is called, create the Tone.js context with interactive latency:

```typescript
// Before Tone.start(), set up a low-latency context
Tone.setContext(new Tone.Context({ latencyHint: 'interactive' }));
```

Consider making this dynamic: use `"interactive"` when recording is active, `"playback"` otherwise. However, switching contexts mid-session requires rebuilding all audio nodes, so this may not be practical. Starting with `"interactive"` globally is simpler and the CPU cost is modest.

### 6.2 New Recording Methods in AudioService

Add new methods that coordinate Transport and Recorder:

```typescript
// In AudioService.ts

private recordingStartTime: number | null = null;

async startOverdubRecording(): Promise<void> {
  if (this.microphone.microphone.state !== 'started') {
    await this.microphone.open();
  }
  this.microphone.microphone.connect(this.recorder);

  // Capture Transport position BEFORE starting
  this.recordingStartTime = Tone.Transport.seconds;

  // Start recorder first (has startup delay), then Transport
  await this.recorder.start();
  Tone.Transport.start();
}

async stopOverdubRecording(): Promise<TrackCreationResult> {
  // Stop Transport first, then recorder
  Tone.Transport.pause();
  const blob = await this.recorder.stop();
  this.microphone.close();

  const arrayBuffer = await blob.arrayBuffer();

  // Calculate latency compensation
  const compensation = this.estimateRoundTripLatency();

  // Create the track with compensated timing
  return this.createRecordedTrack(arrayBuffer, compensation);
}

private estimateRoundTripLatency(): number {
  const ctx = Tone.context.rawContext as AudioContext;
  const outputLatency = ctx.outputLatency ?? 0;
  const baseLatency = ctx.baseLatency ?? 0;
  const lookAhead = Tone.context.lookAhead;
  return outputLatency + baseLatency + lookAhead;
}

private async createRecordedTrack(
  arrayBuffer: ArrayBuffer,
  latencyCompensation: number,
): Promise<TrackCreationResult> {
  // This follows the existing createTrack pattern but with offset
  const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);
  const trackId = uuidv4();
  const blob = new Blob([arrayBuffer], { type: 'audio/*' });
  const blobUrl = URL.createObjectURL(blob);
  const normalizationGainDb =
    LoudnessNormalizer.calculateNormalizationGain(audioBuffer);
  const initialVolume =
    LoudnessNormalizer.gainToInitialVolume(normalizationGainDb);

  // Create channel with latency-compensated start offset
  this.mixer.createChannelWithOffset(
    trackId, audioBuffer, normalizationGainDb, latencyCompensation
  );

  this.audioSourceRepository.add({
    id: trackId, audioBuffer, blobUrl, normalizationGainDb, initialVolume,
  });

  return { trackId, initialVolume };
}
```

### 6.3 Update Mixer to Support Start Offset

```typescript
// In Mixer.ts

createChannelWithOffset(
  trackId: string,
  audioBuffer: AudioBuffer,
  normalizationGainDb = 0,
  startOffset = 0,
): void {
  const player = new Tone.Player(audioBuffer)
    .sync()
    .start(0, startOffset); // `offset` trims the beginning
  const channel = new Tone.Channel().toDestination();
  player.chain(channel);
  this.audioChannelRepository.add(
    new AudioChannel(trackId, channel, normalizationGainDb),
  );
}
```

### 6.4 Update workstationEffects.ts

```typescript
// Updated useMicrophone hook
export const useMicrophone = (isRecording: boolean) => {
  const audioService = useAudioService();
  const projectDispatch = useProjectDispatch();

  useEffect(() => {
    const msg = message({ key: 'microphone' });

    const startRecording = async () => {
      try {
        await audioService.microphone.open();
        await audioService.startOverdubRecording();
        msg.success('Recording started');
      } catch {
        msg.error('Recording failed');
      }
    };

    const stopRecording = async () => {
      if (!audioService.isRecording()) return;
      try {
        const { trackId, initialVolume } =
          await audioService.stopOverdubRecording();
        TrackSignalStore.create(trackId, initialVolume);
        projectDispatch([ADD_TRACK, { trackId, fileName: 'New Track' }]);
        msg.success('Recording stopped');
      } catch {
        msg.error('Recording failed');
      }
    };

    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [isRecording, audioService, projectDispatch]);
};
```

### 6.5 Signal Coordination

The `isPlaying` transport signal and the recording state need coordination. When recording starts, Transport starts playing — so `isPlaying` should become `true`. When recording stops, Transport pauses.

There are two ways to handle this:

**Option 1 (simpler):** Let the `startOverdubRecording` method directly call `Tone.Transport.start()` bypassing the signal system. The `useTransportBridge` hook would notice the Transport state changed on the next animation frame. This is pragmatic but creates a second control path.

**Option 2 (cleaner):** Add recording-aware logic to the transport signals:

```typescript
// In transportSignals.ts
export const isRecording = signal(false);

// Recording start sets both isRecording and isPlaying
export function startRecording(): void {
  isRecording.value = true;
  isPlaying.value = true;
}

export function stopRecording(): void {
  isRecording.value = false;
  isPlaying.value = false;
}
```

Option 2 is more consistent with Mawimbi's existing signal-driven architecture. The `useTransportBridge` would then see the `isPlaying` change and start the Transport, while `useMicrophone` sees the `isRecording` change and starts the Recorder.

**Timing concern:** If both hooks react independently to their respective signal changes, there's a risk of a few-millisecond gap between Transport start and Recorder start. To avoid this, the actual `Transport.start()` and `recorder.start()` calls should happen in **the same synchronous code path**, not in two separate `useEffect` hooks reacting to two separate signals. This argues for keeping the coordinated start inside `AudioService.startOverdubRecording()` (Option 1) and updating signals afterward for UI purposes only.

### 6.6 Preventing Feedback

When the user records while playing back, the mic will pick up audio from the speakers and create a feedback loop. Strategies:

1. **Headphones required** — the simplest approach. Display a prompt suggesting headphones before recording.
2. **Don't route mic to destination** — the current code does NOT route `Tone.UserMedia` to `Tone.Destination` (only to the Recorder/Meter), so there is no software feedback loop. This is correct and should be preserved.
3. **No input monitoring** — the user will not hear themselves through the app while recording. This is a tradeoff: input monitoring requires routing mic → destination, which adds latency and feedback risk. For Phase 1, no input monitoring is acceptable.

### 6.7 Waveform Display for Recorded Tracks

When a recording is created from a Blob, `AudioService.createTrack()` creates a `blobUrl` that WaveSurfer can load. This already works for uploaded files and will work identically for recorded audio — no WaveSurfer changes needed.

---

## 7. Architectural Alignment Assessment

### What fits cleanly

The overdub recording feature fits well into Mawimbi's existing architecture:

- **AudioService singleton** — recording coordination belongs here; it already owns Recorder and Mixer
- **Signal-driven UI** — `isRecording` and `isPlaying` signals keep the Toolbar in sync without prop drilling
- **Track creation pipeline** — `createTrack()` → `Mixer.createChannel()` → `TrackSignalStore.create()` → `dispatch(ADD_TRACK)` works unchanged for recorded tracks
- **WaveSurfer integration** — blob URLs from recorded audio load identically to uploaded files
- **Effect hooks pattern** — `useMicrophone` already encapsulates the recording lifecycle

### What needs attention

- **MicrophoneUserMedia.ts** — Has a `console.log` in its meter interval that should be removed. The class should stay thin and not gain recording logic.
- **Transport control paths** — Currently there's one: signals → `useTransportBridge` → `AudioService`. Recording adds a second path where `AudioService.startOverdubRecording()` calls `Transport.start()` directly. This is acceptable if signals are updated afterward for UI sync.
- **Toolbar state** — Recording currently doesn't imply playback. The UI will need to show both "recording" and "playing" states simultaneously, and disable the play/pause button while recording (since Transport is controlled by the recording lifecycle).
- **Spacebar toggle** — `useSpacebarPlaybackToggle` toggles playback. During recording, spacebar should either stop recording or be disabled, not just pause Transport.

### What does NOT need re-engineering

- Mixer architecture (Player + Channel chains)
- Signal system (signals + computed + bridges)
- Project reducer (track list management)
- Waveform visualization (WaveSurfer)
- Drag-and-drop reordering
- File upload pipeline
- Routing

---

## 8. Key Risks

1. **Mobile browser AudioWorklet issues** — If Mawimbi targets mobile, Phase 2/3 AudioWorklet approaches may encounter the crackling and glitching documented in WebAudio/web-audio-api#2632. Phase 1 (MediaRecorder) is safer on mobile.

2. **Safari MediaRecorder** — Safari's MediaRecorder support arrived late and has quirks. Test encoding format (`audio/mp4` on Safari vs `audio/webm` on Chrome/Firefox). `Tone.Recorder` abstracts some of this but not all.

3. **Bluetooth latency** — `AudioContext.outputLatency` can report 150+ ms with Bluetooth headphones. The latency compensation formula will automatically account for this, but the user experience of hearing audio 150ms late while trying to play in time is fundamentally poor. The app should detect high output latency and warn the user.

4. **MediaRecorder encoding delay** — When `recorder.stop()` is called, the browser finishes encoding the last chunk. This is asynchronous and can take tens of milliseconds. The stop timestamp should be captured before calling `recorder.stop()`, not after the promise resolves.

---

## 9. Future Enhancements (Beyond Phase 1)

- **Manual latency calibration** — Let the user play a click track, record the speakers with the mic, and auto-detect the round-trip latency by cross-correlating the signals.
- **Input monitoring** — Route mic audio to destination with minimal processing for real-time feedback. Requires low lookAhead and interactive latency hint.
- **Punch-in/punch-out** — Record only over a specific time range, replacing part of an existing track.
- **Multi-take recording** — Record multiple takes and comp the best parts.
- **Dynamic latency hint** — Switch to `"interactive"` during recording and `"playback"` otherwise (requires careful AudioContext management).
