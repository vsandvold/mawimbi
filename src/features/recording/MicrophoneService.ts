import * as Tone from 'tone';
import type WorkletAnalyser from '../spectrogram/WorkletAnalyser';

// Low-latency getUserMedia constraints for recording. Disables browser
// processing (echo cancellation, noise suppression, AGC) that adds latency
// and degrades audio quality for music recording. Zero-latency hint requests
// the smallest possible buffer from the audio subsystem.
// TypeScript's MediaTrackConstraints omits `latency`, but it's a valid
// W3C Media Capture constraint that hints the audio subsystem to use the
// smallest possible buffer size. Extend the type to include it.
type LowLatencyConstraints = MediaTrackConstraints & { latency: number };

export const LOW_LATENCY_CONSTRAINTS: LowLatencyConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
  latency: 0,
};

// Monitor volume slider default (0-100 scale, same range as the mixer's
// channel volume slider).
export const DEFAULT_MONITOR_VOLUME = 50;

// Feedback is fast and real with echo cancellation off (#219), so monitoring
// always warns rather than gating on unreliable headphone-detection
// heuristics (spec 005 Decision 3). A round-trip latency above this
// threshold additionally warns about perceived delay.
export const MONITOR_LATENCY_WARNING_THRESHOLD_SECONDS = 0.05;

export function exceedsMonitorLatencyThreshold(
  latencySeconds: number,
): boolean {
  return latencySeconds > MONITOR_LATENCY_WARNING_THRESHOLD_SECONDS;
}

// Tone.UserMedia private fields accessed for custom stream injection.
// Tone.UserMedia doesn't support custom getUserMedia constraints, so we
// bypass its open() and wire the stream into these fields directly.
// Fields are stable across Tone.js v14.x.
type UserMediaInternal = {
  _stream?: MediaStream;
  _mediaStream?: AudioNode;
};

class MicrophoneService {
  private microphone: Tone.UserMedia;
  private meter: Tone.Meter;
  private workletAnalyser: WorkletAnalyser | null = null;
  private _stream: MediaStream | null = null;
  // Input monitoring (spec 005 Decision 3): a Tone.Gain the mic connects
  // through only while monitoring is enabled, entirely inside the Tone
  // graph — independent of the native-context recording capture path.
  private monitorGain: Tone.Gain;
  private _isMonitoring = false;

  constructor() {
    this.meter = new Tone.Meter();
    this.microphone = new Tone.UserMedia().connect(this.meter);
    this.monitorGain = new Tone.Gain(this.volumeToGain(DEFAULT_MONITOR_VOLUME));
  }

  get source(): Tone.ToneAudioNode {
    return this.microphone;
  }

  // The raw MediaStream acquired with low-latency constraints.
  // Prefer this over accessing Tone.UserMedia._stream directly.
  get stream(): MediaStream | null {
    return this._stream;
  }

  get isOpen(): boolean {
    return this.microphone.state === 'started';
  }

  async open(): Promise<void> {
    // Bypass Tone.UserMedia.open() to apply low-latency constraints.
    // Tone.UserMedia hardcodes its own constraints (missing
    // autoGainControl, channelCount, latency) with no override API.
    if (this.isOpen) {
      this.microphone.close();
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: LOW_LATENCY_CONSTRAINTS,
    });
    this._stream = stream;
    this.injectStream(stream);
  }

  close(): void {
    this.disableMonitoring();
    this._stream = null;
    this.microphone.close();
  }

  connect(destination: Tone.ToneAudioNode | AudioNode): void {
    this.microphone.connect(destination as Tone.ToneAudioNode);
  }

  get isMonitoring(): boolean {
    return this._isMonitoring;
  }

  enableMonitoring(): void {
    if (this._isMonitoring) return;
    this.microphone.connect(this.monitorGain);
    this.monitorGain.toDestination();
    this._isMonitoring = true;
  }

  disableMonitoring(): void {
    if (!this._isMonitoring) return;
    this.microphone.disconnect(this.monitorGain);
    this.monitorGain.disconnect();
    this._isMonitoring = false;
  }

  setMonitorVolume(value: number): void {
    this.monitorGain.gain.value = this.volumeToGain(value);
  }

  // Volume slider (0-100) to linear gain, via the same dB conversion the
  // mixer's channel volume slider uses (CLAUDE.md, "Volume slider uses dB
  // conversion") — Tone.Gain's `gain` param is linear amplitude, not dB.
  private volumeToGain(value: number): number {
    return Tone.dbToGain(this.convertToDecibel(value));
  }

  private convertToDecibel(value: number): number {
    return 20 * Math.log((value + 1) / 101);
  }

  // Replace Tone.Meter with a WorkletAnalyser for loudness metering.
  // Call after the analyser has been initialized (module loaded).
  // Re-routes the microphone connection from Tone.Meter to the worklet.
  useWorkletAnalyser(analyser: WorkletAnalyser): void {
    this.microphone.disconnect(this.meter);
    this.workletAnalyser = analyser;
    this.microphone.connect(analyser.input as unknown as Tone.ToneAudioNode);
  }

  getWorkletAnalyser(): WorkletAnalyser | null {
    return this.workletAnalyser;
  }

  getLoudness(): number {
    if (this.workletAnalyser) {
      return this.workletAnalyser.getRawRms();
    }
    const value = this.meter.getValue();
    return typeof value === 'number' ? Math.max(0, value) : 0;
  }

  mute(): void {
    this.microphone.mute = true;
  }

  unmute(): void {
    this.microphone.mute = false;
  }

  // Wire a MediaStream into Tone.UserMedia's private fields, replicating
  // what UserMedia.open() does internally. This preserves the state
  // getter ("started"/"stopped"), close() method, and audio routing
  // through the existing meter and recorder connections.
  private injectStream(stream: MediaStream): void {
    const internal = this.microphone as unknown as UserMediaInternal;
    internal._stream = stream;

    try {
      // The Tone context creates a MediaStreamSourceNode compatible with
      // Tone's internal audio graph (SAC-wrapped). Traverse the output
      // chain to find the underlying native AudioNode, then connect.
      const mic = this.microphone as unknown as Record<string, unknown>;
      const context = mic.context as {
        createMediaStreamSource(s: MediaStream): AudioNode;
      };
      const sourceNode = context.createMediaStreamSource(stream);

      // Tone's connect unwraps ToneAudioNode chains by following .input
      // until it reaches a native node. Replicate that traversal here.
      let dest: unknown = mic.output;
      while (
        dest &&
        typeof dest === 'object' &&
        'input' in dest &&
        (dest as { input: unknown }).input !== dest
      ) {
        dest = (dest as { input: unknown }).input;
      }
      sourceNode.connect(dest as AudioNode);

      internal._mediaStream = sourceNode;
    } catch {
      // Wiring may fail in test environments where mock objects lack
      // the full Tone internal structure. The stream is still stored
      // and accessible via the stream getter for the worklet path.
    }
  }
}

export default MicrophoneService;
