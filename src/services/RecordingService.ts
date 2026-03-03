// RecordingService — owns the recording state machine, microphone, and recorder.
//
// State machine: idle → armed → recording → idle
//
// Encapsulates Tone.Recorder and MicrophoneUserMedia so the rest of the
// app interacts with recording through signals and service methods.

import * as Tone from 'tone';
import { computed, signal, type ReadonlySignal } from '@preact/signals-react';
import MicrophoneUserMedia from './MicrophoneUserMedia';

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
  readonly recordingState = signal<RecordingState>('idle');
  readonly isCountingIn = signal(false);
  readonly isRecording: ReadonlySignal<boolean>;
  readonly microphone: MicrophoneUserMedia;

  private recorder: Tone.Recorder;
  private transport: Transport;
  private context: Context;
  private recordingStartTime: number | null = null;

  constructor(transport: Transport, context: Context) {
    this.transport = transport;
    this.context = context;
    this.microphone = new MicrophoneUserMedia();
    this.recorder = new Tone.Recorder();
    this.isRecording = computed(
      () => this.recordingState.value !== 'idle' || this.isCountingIn.value,
    );
  }

  // --- State machine transitions ---

  arm(): void {
    if (this.recordingState.value !== 'idle') return;
    this.recordingState.value = 'armed';
  }

  disarm(): void {
    if (this.recordingState.value !== 'armed') return;
    this.recordingState.value = 'idle';
  }

  startRecording(): void {
    if (this.recordingState.value !== 'armed') return;
    this.recordingState.value = 'recording';
  }

  stopRecording(): void {
    if (this.recordingState.value !== 'recording') return;
    this.recordingState.value = 'idle';
  }

  toggleArm(): void {
    if (this.recordingState.value === 'idle') {
      this.arm();
    } else if (this.recordingState.value === 'armed') {
      this.disarm();
    }
    // If recording, toggleArm is a no-op — use stopRecording instead
  }

  // --- Count-in helpers ---

  startCountIn(): void {
    this.isCountingIn.value = true;
  }

  stopCountIn(): void {
    this.isCountingIn.value = false;
  }

  // --- Derived queries ---

  isIdle(): boolean {
    return this.recordingState.value === 'idle';
  }

  isArmed(): boolean {
    return this.recordingState.value === 'armed';
  }

  isActivelyRecording(): boolean {
    return this.recordingState.value === 'recording';
  }

  // True when the transport should be locked from user playback control
  // (during count-in or active recording).
  isTransportLocked(): boolean {
    return this.recordingState.value === 'recording' || this.isCountingIn.value;
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

  // --- Overdub recording ---

  async startOverdubRecording(): Promise<void> {
    if (!this.microphone.isOpen) {
      await this.microphone.open();
    }
    this.microphone.connect(this.recorder);

    // Capture transport position before starting
    this.recordingStartTime = this.transport.seconds;

    // Start recorder first (has startup delay), then Transport
    await this.recorder.start();
    this.transport.start();
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

    const blob = await this.recorder.stop();
    this.microphone.close();

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

    const latencyCompensation = this.estimateRoundTripLatency();

    return { audioBuffer, arrayBuffer, startTime, latencyCompensation };
  }

  isOverdubRecording(): boolean {
    return this.recorder.state === 'started';
  }

  getRecordingStartTime(): number {
    return this.recordingStartTime ?? 0;
  }

  estimateRoundTripLatency(): number {
    const ctx = this.context.rawContext;
    const outputLatency =
      (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    const baseLatency =
      (ctx as AudioContext & { baseLatency?: number }).baseLatency ?? 0;
    const lookAhead = this.context.lookAhead;
    // One render quantum (~2.9ms at 44.1kHz) as a conservative input latency
    // estimate, per research on Web Audio API latency characteristics
    const estimatedInputLatency = 128 / ctx.sampleRate;
    return outputLatency + baseLatency + lookAhead + estimatedInputLatency;
  }

  // --- Reset ---

  reset(): void {
    this.recordingState.value = 'idle';
    this.isCountingIn.value = false;
  }
}

export default RecordingService;
