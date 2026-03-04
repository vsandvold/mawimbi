// TrackService — owns track creation, per-track signals, and the mixer.
//
// Encapsulates MixerService (Tone.Player + Tone.Channel chains) and the
// audio source repository. Per-track volume/mute/solo signals are synced
// to the mixer channels automatically via effects, so consumers never
// need to bridge signals to the audio engine themselves.

import { v4 as uuidv4 } from 'uuid';
import {
  computed,
  effect,
  signal,
  type ReadonlySignal,
  type Signal,
} from '@preact/signals-react';
import { LoudnessNormalizer } from './LoudnessNormalizer';
import MixerService, { type AudioChannel } from './MixerService';
import { type TrackId } from '../types/track';

export type TrackSignals = {
  volume: Signal<number>;
  mute: Signal<boolean>;
  solo: Signal<boolean>;
};

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

type Context = {
  decodeAudioData: (arrayBuffer: ArrayBuffer) => Promise<AudioBuffer>;
};

const DEFAULT_VOLUME = 100;

class TrackService {
  private readonly mixer: MixerService;

  // --- Private signals (only the service writes these) ---

  private readonly _mutedTracks: ReadonlySignal<TrackId[]>;

  // --- Narrow channel for reactive consumers (hooks) ---

  readonly signals: {
    readonly mutedTracks: ReadonlySignal<TrackId[]>;
  };

  private context: Context;
  private audioSourceRepository: AudioSourceRepository;
  private signalStore = new Map<TrackId, TrackSignals>();
  private effectDisposers = new Map<TrackId, Array<() => void>>();

  // Bumped on every store mutation so computed signals that depend on the
  // store's membership (e.g. mutedTracks) know to re-evaluate.
  private storeVersion = signal(0);

  constructor(context: Context) {
    this.context = context;
    this.audioSourceRepository = new AudioSourceRepository();
    this.mixer = new MixerService();
    this._mutedTracks = computed(() => {
      // Subscribe to store membership changes
      void this.storeVersion.value;

      const allIds = Array.from(this.signalStore.keys());
      const hasSolo = allIds.some((id) => this.signalStore.get(id)!.solo.value);
      return allIds.filter((id) => {
        const s = this.signalStore.get(id)!;
        return s.mute.value || (hasSolo && !s.solo.value);
      });
    });
    this.signals = {
      mutedTracks: this._mutedTracks,
    };
  }

  // --- Plain getter for non-reactive consumers (tests, workflows) ---

  get mutedTracks(): TrackId[] {
    return this._mutedTracks.value;
  }

  // --- Track creation ---

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

    this.createSignals(trackId, initialVolume);

    return { trackId, initialVolume };
  }

  createRecordedTrack(
    audioBuffer: AudioBuffer,
    arrayBuffer: ArrayBuffer,
    startTime: number,
  ): TrackCreationResult {
    const trackId = uuidv4();
    const blob = new Blob([arrayBuffer], { type: 'audio/*' });
    const blobUrl = URL.createObjectURL(blob);
    const normalizationGainDb =
      LoudnessNormalizer.calculateNormalizationGain(audioBuffer);
    const initialVolume =
      LoudnessNormalizer.gainToInitialVolume(normalizationGainDb);

    this.mixer.createChannel(
      trackId,
      audioBuffer,
      normalizationGainDb,
      startTime,
    );
    this.audioSourceRepository.add({
      id: trackId,
      audioBuffer,
      blobUrl,
      normalizationGainDb,
      initialVolume,
      startTime,
    });

    this.createSignals(trackId, initialVolume);

    return { trackId, initialVolume };
  }

  // --- Track signal management ---

  createSignals(trackId: TrackId, initialVolume?: number): TrackSignals {
    const signals: TrackSignals = {
      volume: signal(initialVolume ?? DEFAULT_VOLUME),
      mute: signal(false),
      solo: signal(false),
    };
    this.signalStore.set(trackId, signals);
    this.storeVersion.value++;

    // Sync signals → mixer channel automatically
    const channel = this.mixer.retrieveChannel(trackId);
    if (channel) {
      this.setupChannelSync(trackId, signals, channel);
    }

    return signals;
  }

  getSignals(trackId: TrackId): TrackSignals | undefined {
    return this.signalStore.get(trackId);
  }

  disposeSignals(trackId: TrackId): void {
    const disposers = this.effectDisposers.get(trackId);
    if (disposers) {
      for (const dispose of disposers) dispose();
      this.effectDisposers.delete(trackId);
    }
    this.signalStore.delete(trackId);
    this.storeVersion.value++;
  }

  signalKeys(): IterableIterator<TrackId> {
    return this.signalStore.keys();
  }

  // --- Track retrieval ---

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

  retrieveStartTime(trackId: string): number | undefined {
    return this.audioSourceRepository.get(trackId)?.startTime;
  }

  getTotalTime(): number {
    return this.audioSourceRepository
      .getAll()
      .map((source) => source.startTime + source.audioBuffer.duration)
      .reduce((prev, curr) => (prev >= curr ? prev : curr), 0);
  }

  // --- Mixer delegates ---

  getLoudness(): number {
    return this.mixer.getLoudness();
  }

  retrieveChannel(trackId: string): AudioChannel | undefined {
    return this.mixer.retrieveChannel(trackId);
  }

  // Recreates a mixer channel for a track whose audio source is already
  // stored (e.g. after undo/redo removes and re-adds a track).
  recreateChannel(trackId: string): boolean {
    const source = this.audioSourceRepository.get(trackId);
    if (!source) return false;
    this.mixer.createChannel(
      trackId,
      source.audioBuffer,
      source.normalizationGainDb,
      source.startTime,
    );
    return true;
  }

  // --- Cleanup ---

  deleteChannel(trackId: string): void {
    this.mixer.deleteChannel(trackId);
  }

  reset(): void {
    for (const trackId of this.signalStore.keys()) {
      this.disposeSignals(trackId);
    }
    this.signalStore.clear();
    this.storeVersion.value++;
  }

  // --- Signal-to-channel sync ---

  private setupChannelSync(
    trackId: TrackId,
    signals: TrackSignals,
    channel: AudioChannel,
  ): void {
    const disposers: Array<() => void> = [];

    disposers.push(
      effect(() => {
        channel.volume = signals.volume.value;
      }),
    );

    disposers.push(
      effect(() => {
        channel.mute = signals.mute.value;
      }),
    );

    disposers.push(
      effect(() => {
        channel.solo = signals.solo.value;
      }),
    );

    this.effectDisposers.set(trackId, disposers);
  }
}

class AudioSourceRepository {
  private audioSources: AudioSource[] = [];

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

export { AudioChannel } from './MixerService';

export default TrackService;
