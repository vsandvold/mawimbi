// RecordingService — owns the recording state machine, microphone, and recorder.
//
// State machine: idle → armed → recording → idle
//
// Supports two recording backends:
//   1. AudioWorklet-based (WorkletRecorder) — sample-accurate PCM capture on
//      the audio thread, no MediaRecorder encoding delay.
//   2. Tone.Recorder (MediaRecorder) — fallback when AudioWorklet is
//      unavailable or initialization fails.
//
// Call initializeWorkletRecorder() once at startup to attempt the worklet
// path. If it fails, the service silently falls back to Tone.Recorder.

import * as Tone from 'tone';
import { computed, signal, type ReadonlySignal } from '@preact/signals-react';
import MicrophoneService from './MicrophoneService';
import LatencyCompensation from './LatencyCompensation';
import WorkletRecorder from './WorkletRecorder';

export type RecordingState = 'idle' | 'armed' | 'recording';

type Transport = {
  start: () => void;
  stop: () => void;
  pause: () => void;
  seconds: number;
  state: string;
};

type Context = {
  decodeAudioData: (arrayBuffer: ArrayBuffer) => Promise<AudioBuffer>;
  lookAhead: number;
  rawContext: AudioContext | OfflineAudioContext;
};

export type OverdubResult = {
  audioBuffer: AudioBuffer;
  arrayBuffer: ArrayBuffer;
  startTime: number;
  latencyCompensation: number;
};

class RecordingService {
  // --- Private signals (only the service writes these) ---

  private readonly _recordingState = signal<RecordingState>('idle');
  private readonly _isCountingIn = signal(false);
  private readonly _isRecording: ReadonlySignal<boolean>;

  // --- Narrow channel for reactive consumers (hooks) ---

  readonly signals: {
    readonly recordingState: ReadonlySignal<RecordingState>;
    readonly isCountingIn: ReadonlySignal<boolean>;
    readonly isRecording: ReadonlySignal<boolean>;
  };

  private readonly microphone: MicrophoneService;
  readonly latencyCompensation: LatencyCompensation;

  private recorder: Tone.Recorder;
  private workletRecorder: WorkletRecorder | null = null;
  private transport: Transport;
  private context: Context;
  private recordingStartTime: number | null = null;

  constructor(transport: Transport, context: Context) {
    this.transport = transport;
    this.context = context;
    this.microphone = new MicrophoneService();
    this.recorder = new Tone.Recorder();
    this.latencyCompensation = new LatencyCompensation(
      context.rawContext,
      context.lookAhead,
    );
    this._isRecording = computed(
      () => this._recordingState.value !== 'idle' || this._isCountingIn.value,
    );
    this.signals = {
      recordingState: this._recordingState,
      isCountingIn: this._isCountingIn,
      isRecording: this._isRecording,
    };
  }

  // --- Plain getters for non-reactive consumers (tests, workflows) ---

  get recordingState(): RecordingState {
    return this._recordingState.value;
  }

  get isCountingIn(): boolean {
    return this._isCountingIn.value;
  }

  get isRecording(): boolean {
    return this._isRecording.value;
  }

  // --- State machine transitions ---

  arm(): void {
    if (this._recordingState.value !== 'idle') return;
    this._recordingState.value = 'armed';
  }

  disarm(): void {
    if (this._recordingState.value !== 'armed') return;
    this._recordingState.value = 'idle';
  }

  startRecording(): void {
    if (this._recordingState.value !== 'armed') return;
    this._recordingState.value = 'recording';
  }

  stopRecording(): void {
    if (this._recordingState.value !== 'recording') return;
    this._recordingState.value = 'idle';
  }

  toggleArm(): void {
    if (this._recordingState.value === 'idle') {
      this.arm();
    } else if (this._recordingState.value === 'armed') {
      this.disarm();
    }
    // If recording, toggleArm is a no-op — use stopRecording instead
  }

  // --- Count-in helpers ---

  startCountIn(): void {
    this._isCountingIn.value = true;
  }

  stopCountIn(): void {
    this._isCountingIn.value = false;
  }

  // --- Derived queries ---

  isIdle(): boolean {
    return this._recordingState.value === 'idle';
  }

  isArmed(): boolean {
    return this._recordingState.value === 'armed';
  }

  isActivelyRecording(): boolean {
    return this._recordingState.value === 'recording';
  }

  // True when the transport should be locked from user playback control
  // (during count-in or active recording).
  isTransportLocked(): boolean {
    return (
      this._recordingState.value === 'recording' || this._isCountingIn.value
    );
  }

  // --- Microphone management ---

  async prepareMicrophone(): Promise<void> {
    if (!this.microphone.isOpen) {
      await this.microphone.open();
    }
  }

  closeMicrophone(): void {
    if (this.microphone.isOpen) {
      this.microphone.close();
    }
  }

  getLoudness(): number {
    return this.microphone.getLoudness();
  }

  getMicrophoneSource(): Tone.ToneAudioNode {
    return this.microphone.source;
  }

  // --- WorkletRecorder initialization ---

  // Attempt to initialize the AudioWorklet-based recorder. Call once at
  // startup. Falls back to Tone.Recorder silently on failure.
  async initializeWorkletRecorder(): Promise<void> {
    try {
      const rawContext = this.context.rawContext as AudioContext;
      if (!rawContext.audioWorklet) return;
      const wr = new WorkletRecorder(rawContext);
      await wr.initialize();
      this.workletRecorder = wr;
    } catch {
      // AudioWorklet not supported or module failed to load — keep using
      // Tone.Recorder as fallback.
      this.workletRecorder = null;
    }
  }

  get isWorkletRecorderAvailable(): boolean {
    return this.workletRecorder !== null;
  }

  // --- Overdub recording ---

  async startOverdubRecording(): Promise<void> {
    if (!this.microphone.isOpen) {
      await this.microphone.open();
    }

    // Capture transport position before starting
    this.recordingStartTime = this.transport.seconds;

    if (this.workletRecorder) {
      this.microphone.connect(this.workletRecorder.input);
      this.workletRecorder.start();
      this.transport.start();
    } else {
      this.microphone.connect(this.recorder);
      // Start recorder first (has startup delay), then Transport
      await this.recorder.start();
      this.transport.start();
    }
  }

  async stopOverdubRecording(): Promise<OverdubResult> {
    // Transport.stop() (not pause) ensures the next Transport.start() is a
    // fresh start. Synced players created after Transport.pause() don't
    // trigger on resume because they were never "playing" before the pause.
    this.transport.stop();

    const startTime = this.recordingStartTime ?? 0;
    this.recordingStartTime = null;

    // Position transport at the recording start immediately after stop,
    // before any async operations. The Scrubber's animate loop reads
    // transport.seconds on every frame — without this, it would briefly
    // see seconds=0 (the post-stop default) and jump the scroll position
    // to the beginning during the async gap.
    this.transport.seconds = startTime;

    const latencyCompensation = this.estimateRoundTripLatency();

    if (this.workletRecorder) {
      const audioBuffer = await this.workletRecorder.stop();
      this.microphone.close();

      // Encode to ArrayBuffer (WAV) for undo/redo and blob URL storage.
      // The WorkletRecorder produces PCM directly — we encode to a raw
      // interleaved buffer for downstream consumption.
      const arrayBuffer = this.audioBufferToArrayBuffer(audioBuffer);

      return { audioBuffer, arrayBuffer, startTime, latencyCompensation };
    }

    const blob = await this.recorder.stop();
    this.microphone.close();

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

    return { audioBuffer, arrayBuffer, startTime, latencyCompensation };
  }

  isOverdubRecording(): boolean {
    if (this.workletRecorder) {
      return this.workletRecorder.state === 'started';
    }
    return this.recorder.state === 'started';
  }

  getRecordingStartTime(): number {
    return this.recordingStartTime ?? 0;
  }

  estimateRoundTripLatency(): number {
    return this.latencyCompensation.getTotalCompensation();
  }

  // --- Reset ---

  reset(): void {
    this._recordingState.value = 'idle';
    this._isCountingIn.value = false;
  }

  // Converts an AudioBuffer to a raw ArrayBuffer containing interleaved
  // Float32 PCM data. Used by the worklet path which produces AudioBuffer
  // directly (no Blob encoding step).
  private audioBufferToArrayBuffer(audioBuffer: AudioBuffer): ArrayBuffer {
    const channels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const interleaved = new Float32Array(length * channels);

    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        interleaved[i * channels + ch] = channelData[i];
      }
    }

    return interleaved.buffer;
  }
}

export default RecordingService;
