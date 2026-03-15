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
import type WorkletAnalyser from '../spectrogram/WorkletAnalyser';

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
  sampleRate: number;
};

export type OverdubResult = {
  audioBuffer: AudioBuffer;
  arrayBuffer: ArrayBuffer;
  startTime: number;
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
  // Native MediaStreamSourceNode used to bridge the microphone stream to the
  // AudioWorklet recorder. Created on the native AudioContext (bypassing
  // standardized-audio-context) so the worklet node can be connected without
  // triggering node registry errors. Cleaned up when recording stops.
  private nativeSourceNode: MediaStreamAudioSourceNode | null = null;
  // The actual native browser AudioContext, extracted from Tone.js's
  // standardized-audio-context wrapper. Needed to create native audio nodes
  // that can connect to the native AudioWorkletNode without triggering
  // standardized-audio-context's node registry errors.
  // See https://github.com/Tonejs/Tone.js/issues/712.
  private nativeAudioContext: AudioContext | null = null;
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

  useWorkletAnalyser(analyser: WorkletAnalyser): void {
    this.microphone.useWorkletAnalyser(analyser);
  }

  getWorkletAnalyser(): WorkletAnalyser | null {
    return this.microphone.getWorkletAnalyser();
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
      // Tone.js v14+ uses standardized-audio-context, whose rawContext is a
      // wrapper — not the native browser AudioContext. The wrapper's internal
      // node registry breaks when connecting AudioWorkletNode instances.
      // Extract the actual native AudioContext via the private _nativeContext
      // field so all worklet-path nodes are native and bypass the registry.
      // See https://github.com/Tonejs/Tone.js/issues/712.
      const nativeCtx =
        (rawContext as unknown as { _nativeContext?: AudioContext })
          ._nativeContext ?? rawContext;
      this.nativeAudioContext = nativeCtx;
      const wr = new WorkletRecorder(nativeCtx);
      await wr.initialize();
      this.workletRecorder = wr;
    } catch {
      // AudioWorklet not supported or module failed to load — keep using
      // Tone.Recorder as fallback.
      this.workletRecorder = null;
      this.nativeAudioContext = null;
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

    if (this.workletRecorder && this.nativeAudioContext) {
      // Connect microphone to worklet via a native MediaStreamSourceNode.
      // MicrophoneService exposes the raw MediaStream acquired with
      // low-latency constraints. We create a native source node on the
      // native AudioContext and connect it to the native AudioWorkletNode,
      // bypassing standardized-audio-context entirely for the recording path.
      const stream = this.microphone.stream!;
      this.nativeSourceNode =
        this.nativeAudioContext.createMediaStreamSource(stream);
      this.nativeSourceNode.connect(this.workletRecorder.input);
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

    const compensation = this.latencyCompensation.getTotalCompensation();

    if (this.workletRecorder) {
      const rawBuffer = await this.workletRecorder.stop();
      // Clean up native source node before closing the microphone
      if (this.nativeSourceNode) {
        this.nativeSourceNode.disconnect();
        this.nativeSourceNode = null;
      }
      this.microphone.close();

      // Trim leading latency samples so the recording aligns with the
      // transport timeline. Without this, the overdub is shifted forward
      // by the round-trip latency (output + base + look-ahead + input).
      const audioBuffer = this.latencyCompensation.trimBuffer(
        rawBuffer,
        compensation,
      );
      const arrayBuffer = this.audioBufferToArrayBuffer(audioBuffer);

      return { audioBuffer, arrayBuffer, startTime };
    }

    const blob = await this.recorder.stop();
    this.microphone.close();

    const rawArrayBuffer = await blob.arrayBuffer();
    const rawBuffer = await this.context.decodeAudioData(rawArrayBuffer);

    // Trim leading latency samples so the recording aligns with the
    // transport timeline.
    const audioBuffer = this.latencyCompensation.trimBuffer(
      rawBuffer,
      compensation,
    );
    // Re-encode from the trimmed buffer when trimming occurred, otherwise
    // keep the original encoded bytes.
    const arrayBuffer =
      audioBuffer !== rawBuffer
        ? this.audioBufferToArrayBuffer(audioBuffer)
        : rawArrayBuffer;

    return { audioBuffer, arrayBuffer, startTime };
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
