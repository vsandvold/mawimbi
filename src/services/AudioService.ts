import * as Tone from 'tone';
import { v4 as uuidv4 } from 'uuid';
import { LoudnessNormalizer } from './LoudnessNormalizer';
import MicrophoneUserMedia from './MicrophoneUserMedia';
import Mixer from './Mixer';

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
};

class AudioService {
  microphone: MicrophoneUserMedia;
  mixer: Mixer;

  private static instance: AudioService;
  private audioSourceRepository: AudioSourceRepository;
  private recorder: Tone.Recorder;
  private recordingStartTime: number | null = null;

  private constructor() {
    this.audioSourceRepository = new AudioSourceRepository();
    this.microphone = new MicrophoneUserMedia();
    this.mixer = new Mixer();
    this.recorder = new Tone.Recorder();
  }

  static getInstance(): AudioService {
    if (!AudioService.instance) {
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
    const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);
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
    Tone.Transport.start();
  }

  pausePlayback(transportTime?: number): void {
    Tone.Transport.pause();
    if (transportTime !== undefined) {
      this.setTransportTime(transportTime);
    }
  }

  stopPlayback(transportTime?: number): void {
    Tone.Transport.stop();
    if (transportTime !== undefined) {
      this.setTransportTime(transportTime);
    }
  }

  togglePlayback(): void {
    if (Tone.Transport.state === 'started') {
      Tone.Transport.pause();
    } else {
      Tone.Transport.start();
    }
  }

  getTransportTime(): number {
    return Tone.Transport.seconds;
  }

  setTransportTime(transportTime: number): void {
    Tone.Transport.seconds = transportTime;
  }

  getTotalTime(): number {
    return this.audioSourceRepository
      .getAll()
      .map((source) => source.audioBuffer.duration)
      .reduce((prev, curr) => (prev >= curr ? prev : curr), 0);
  }

  // --- Overdub recording (Phase 1: MediaRecorder + timestamp bookkeeping) ---

  async startOverdubRecording(): Promise<void> {
    if (this.microphone.microphone.state !== 'started') {
      await this.microphone.open();
    }
    this.microphone.microphone.connect(this.recorder);

    // Capture transport position before starting
    this.recordingStartTime = Tone.Transport.seconds;

    // Start recorder first (has startup delay), then Transport
    await this.recorder.start();
    Tone.Transport.start();
  }

  async stopOverdubRecording(): Promise<TrackCreationResult> {
    // Capture stop timestamp before stopping to avoid encoding-delay skew
    Tone.Transport.pause();
    const blob = await this.recorder.stop();
    this.microphone.close();

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);

    const latencyCompensation = this.estimateRoundTripLatency();
    const startTime = this.recordingStartTime ?? 0;
    this.recordingStartTime = null;

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
    const ctx = Tone.context.rawContext as AudioContext;
    const outputLatency = ctx.outputLatency ?? 0;
    const baseLatency = ctx.baseLatency ?? 0;
    const lookAhead = Tone.context.lookAhead;
    // One render quantum (~2.9ms at 44.1kHz) as a conservative input latency
    // estimate, per research on Web Audio API latency characteristics
    const estimatedInputLatency = 128 / ctx.sampleRate;
    return outputLatency + baseLatency + lookAhead + estimatedInputLatency;
  }

  // --- Legacy recording methods (independent of transport) ---

  async startRecording(): Promise<unknown> {
    if (this.microphone.microphone.state !== 'started') {
      return Promise.reject();
    }
    this.microphone.microphone.connect(this.recorder);
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
