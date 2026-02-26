import * as Tone from 'tone';
import { v4 as uuidv4 } from 'uuid';
import { LoudnessNormalizer } from './LoudnessNormalizer';
import MicrophoneUserMedia from './MicrophoneUserMedia';
import Mixer from './Mixer';
import SpectrogramCache from './SpectrogramCache';

// Reduce scheduling lookahead from the default 0.1s to 0.05s for lower
// recording latency while keeping enough headroom to avoid scheduling glitches
// with many concurrent players (Tone.js issue #711).
const RECORDING_LOOK_AHEAD = 0.05;

type AudioContextStarter = {
  resolve: () => void;
  reject: () => void;
};

function startAudioContext(this: AudioContextStarter, event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  Tone.start()
    .then(() => this.resolve())
    .catch(() => this.reject());
  window.removeEventListener('click', startAudioContext);
}

export type TrackCreationResult = {
  trackId: string;
  initialVolume: number;
};

type AudioSource = {
  id: string;
  audioBuffer: AudioBuffer;
  blobUrl: string;
  normalizationGainDb: number;
  initialVolume: number;
  startTime: number;
};

class AudioService {
  microphone: MicrophoneUserMedia;
  mixer: Mixer;
  spectrogramCache: SpectrogramCache;

  private static instance: AudioService;
  private audioSourceRepository: AudioSourceRepository;
  private recorder: Tone.Recorder;
  private recordingStartTime: number | null = null;

  // Cache Tone.js singletons at construction time so every method uses the
  // same transport/context that was configured in getInstance(). Repeated
  // Tone.getTransport() / Tone.context lookups are fragile because Tone.js
  // resolves them from mutable global state — if the context is swapped or
  // re-created the cached references stay consistent while fresh lookups
  // could silently resolve to a different object.
  private readonly transport = Tone.getTransport();
  private readonly context = Tone.context;

  private constructor() {
    this.audioSourceRepository = new AudioSourceRepository();
    this.microphone = new MicrophoneUserMedia();
    this.mixer = new Mixer();
    this.recorder = new Tone.Recorder();
    this.spectrogramCache = new SpectrogramCache();
  }

  static getInstance(): AudioService {
    if (!AudioService.instance) {
      // Configure the Tone.js context before creating any audio nodes so
      // they share the same context as Tone.getTransport(). Without this,
      // nodes end up on the default context while getTransport() resolves
      // to the custom context. Transport.start() only resumes its own
      // context, so the default context stays suspended and the Recorder's
      // MediaStreamDestination produces no audio data.
      Tone.setContext(
        new Tone.Context({
          latencyHint: 'interactive',
          lookAhead: RECORDING_LOOK_AHEAD,
        }),
      );
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  static startAudio(clickElement = window): Promise<void> {
    return new Promise((resolve, reject) => {
      clickElement.addEventListener(
        'click',
        startAudioContext.bind({ resolve, reject }),
      );
    });
  }

  async createTrack(arrayBuffer: ArrayBuffer): Promise<TrackCreationResult> {
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
    const trackId = uuidv4();
    const blob = new Blob([arrayBuffer], { type: 'audio/*' });
    const blobUrl = URL.createObjectURL(blob);
    const normalizationGainDb =
      LoudnessNormalizer.calculateNormalizationGain(audioBuffer);
    const initialVolume =
      LoudnessNormalizer.gainToInitialVolume(normalizationGainDb);
    this.mixer.createChannel(trackId, audioBuffer, normalizationGainDb);
    this.audioSourceRepository.add({
      id: trackId,
      audioBuffer,
      blobUrl,
      normalizationGainDb,
      initialVolume,
      startTime: 0,
    });
    return { trackId, initialVolume };
  }

  retrieveAudioBuffer(trackId: string): AudioBuffer | undefined {
    return this.audioSourceRepository.get(trackId)?.audioBuffer;
  }

  retrieveBlobUrl(trackId: string): string | undefined {
    return this.audioSourceRepository.get(trackId)?.blobUrl;
  }

  retrieveNormalizationGainDb(trackId: string): number {
    return this.audioSourceRepository.get(trackId)?.normalizationGainDb ?? 0;
  }

  retrieveInitialVolume(trackId: string): number | undefined {
    return this.audioSourceRepository.get(trackId)?.initialVolume;
  }

  startPlayback(transportTime?: number): void {
    if (transportTime !== undefined) {
      this.setTransportTime(transportTime);
    }
    this.transport.start();
  }

  pausePlayback(transportTime?: number): void {
    this.transport.pause();
    if (transportTime !== undefined) {
      this.setTransportTime(transportTime);
    }
  }

  stopPlayback(transportTime?: number): void {
    this.transport.stop();
    if (transportTime !== undefined) {
      this.setTransportTime(transportTime);
    }
  }

  togglePlayback(): void {
    if (this.transport.state === 'started') {
      this.transport.pause();
    } else {
      this.transport.start();
    }
  }

  getTransportTime(): number {
    return this.transport.seconds;
  }

  setTransportTime(transportTime: number): void {
    this.transport.seconds = transportTime;
  }

  getTotalTime(): number {
    return this.audioSourceRepository
      .getAll()
      .map((source) => source.startTime + source.audioBuffer.duration)
      .reduce((prev, curr) => (prev >= curr ? prev : curr), 0);
  }

  // --- Overdub recording (Phase 1: MediaRecorder + timestamp bookkeeping) ---

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

  async stopOverdubRecording(): Promise<TrackCreationResult> {
    // Transport.stop() (not pause) ensures the next Transport.start() is a
    // fresh start. Synced players created after Transport.pause() don't
    // trigger on resume because they were never "playing" before the pause.
    // Transport.stop() resets the timeline so all synced players — including
    // the one about to be created for this recording — start from their
    // scheduled positions on the next Transport.start().
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

    return this.createRecordedTrack(
      audioBuffer,
      arrayBuffer,
      startTime,
      latencyCompensation,
    );
  }

  isOverdubRecording(): boolean {
    return this.recorder.state === 'started';
  }

  estimateRoundTripLatency(): number {
    const ctx = this.context.rawContext as AudioContext;
    const outputLatency = ctx.outputLatency ?? 0;
    const baseLatency = ctx.baseLatency ?? 0;
    const lookAhead = this.context.lookAhead;
    // One render quantum (~2.9ms at 44.1kHz) as a conservative input latency
    // estimate, per research on Web Audio API latency characteristics
    const estimatedInputLatency = 128 / ctx.sampleRate;
    return outputLatency + baseLatency + lookAhead + estimatedInputLatency;
  }

  // --- Legacy recording methods (independent of transport) ---

  async startRecording(): Promise<unknown> {
    if (!this.microphone.isOpen) {
      return Promise.reject();
    }
    this.microphone.connect(this.recorder);
    return await this.recorder.start();
  }

  async stopRecording(): Promise<ArrayBuffer> {
    if (this.recorder.state === 'stopped') {
      return Promise.reject();
    }
    const blob = await this.recorder.stop();
    return await blob.arrayBuffer();
  }

  isRecording(): boolean {
    return this.recorder.state === 'started';
  }

  private createRecordedTrack(
    audioBuffer: AudioBuffer,
    arrayBuffer: ArrayBuffer,
    startTime: number,
    latencyCompensation: number,
  ): TrackCreationResult {
    const trackId = uuidv4();
    const blob = new Blob([arrayBuffer], { type: 'audio/*' });
    const blobUrl = URL.createObjectURL(blob);
    const normalizationGainDb =
      LoudnessNormalizer.calculateNormalizationGain(audioBuffer);
    const initialVolume =
      LoudnessNormalizer.gainToInitialVolume(normalizationGainDb);

    // The audioOffset trims latency from the beginning of the recording.
    // The startTime positions the track at the correct transport position.
    this.mixer.createChannel(
      trackId,
      audioBuffer,
      normalizationGainDb,
      startTime,
      latencyCompensation,
    );
    this.audioSourceRepository.add({
      id: trackId,
      audioBuffer,
      blobUrl,
      normalizationGainDb,
      initialVolume,
      startTime,
    });
    return { trackId, initialVolume };
  }
}

class AudioSourceRepository {
  private audioSources: AudioSource[];

  constructor() {
    this.audioSources = [];
  }

  add(source: AudioSource): void {
    this.audioSources.push(source);
  }

  get(id: string): AudioSource | undefined {
    return this.audioSources.find((source) => source.id === id);
  }

  getAll(): AudioSource[] {
    return this.audioSources;
  }
}

export { AudioChannel } from './Mixer';

export default AudioService;
