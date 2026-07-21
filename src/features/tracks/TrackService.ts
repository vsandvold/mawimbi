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
import {
  DEFAULT_EFFECT_AMOUNTS,
  EFFECT_ORDER,
  type EffectAmounts,
  type EffectId,
} from './EffectsChain';
import { LoudnessNormalizer } from './LoudnessNormalizer';
import MixerService, { type AudioChannel } from './MixerService';
import type WorkletAnalyser from '../spectrogram/WorkletAnalyser';
import { type TrackId } from './types';

export type TrackSignals = {
  volume: Signal<number>;
  mute: Signal<boolean>;
  solo: Signal<boolean>;
  effects: Record<EffectId, Signal<number>>;
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

type TrackCreatedCallback = (trackId: string, audioBuffer: AudioBuffer) => void;

const DEFAULT_VOLUME = 100;

// Sonic counterpart of edit mode's visual background dim (spec 004):
// non-active tracks drop by this much so the edited track reads as the
// foreground of one mix without silencing its context (edit mode never
// auto-solos). Ear-tuning belongs to the on-device QA pass, like the
// effect-macro curves.
export const EDIT_FOCUS_DIM_DB = -12;

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
  private onTrackCreated: TrackCreatedCallback | null = null;

  // Bumped on every store mutation so computed signals that depend on the
  // store's membership (e.g. mutedTracks) know to re-evaluate.
  private storeVersion = signal(0);

  // Mirrors the workstation's edit mode into the audio engine (see
  // setEditFocus). Private so the channel-sync effects are the only
  // consumers; the workstation drives it through the setter.
  private readonly _editFocusTrackId = signal<TrackId | null>(null);

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

  // --- Edit-mode audio focus ---

  // While a track is focused for editing, muting and solo are bypassed at
  // the channel level and every other track is dimmed by
  // EDIT_FOCUS_DIM_DB, so the edited track is always audible over a
  // quieter mix. The user's mute/solo/volume signals are never touched —
  // clearing the focus (null) restores the mix exactly as it was.
  setEditFocus(trackId: TrackId | null): void {
    this._editFocusTrackId.value = trackId;
  }

  // --- Lifecycle hooks ---

  setOnTrackCreated(callback: TrackCreatedCallback): void {
    this.onTrackCreated = callback;
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
    this.onTrackCreated?.(trackId, audioBuffer);

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
    this.onTrackCreated?.(trackId, audioBuffer);

    return { trackId, initialVolume };
  }

  // Restores a track from persisted audio data using a known track ID.
  // Unlike createTrack(), this does not generate a new ID. `effects` carries
  // the project's persisted per-track amounts (if any) so the restored
  // signals start at the user's settings instead of dry defaults.
  async restoreTrack(
    trackId: string,
    arrayBuffer: ArrayBuffer,
    startTime: number,
    effects?: EffectAmounts,
  ): Promise<TrackCreationResult> {
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
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

    this.createSignals(trackId, initialVolume, effects);
    this.onTrackCreated?.(trackId, audioBuffer);

    return { trackId, initialVolume };
  }

  // --- Track signal management ---

  createSignals(
    trackId: TrackId,
    initialVolume?: number,
    effects?: EffectAmounts,
  ): TrackSignals {
    const initialEffects = effects ?? DEFAULT_EFFECT_AMOUNTS;
    const signals: TrackSignals = {
      volume: signal(initialVolume ?? DEFAULT_VOLUME),
      mute: signal(false),
      solo: signal(false),
      effects: {
        space: signal(initialEffects.space),
        echo: signal(initialEffects.echo),
        tone: signal(initialEffects.tone),
      },
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
    this.disposeSyncEffects(trackId);
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

  useWorkletAnalyser(analyser: WorkletAnalyser): void {
    this.mixer.useWorkletAnalyser(analyser);
  }

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
    this.resyncSignals(trackId);
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

  // Re-binds signal sync after a channel is rebuilt. The undo flow
  // (projectPageEffects' useTrackSideEffects) recreates signals before the
  // channel exists, so createSignals cannot wire the sync there — and a
  // fresh channel starts at dry defaults regardless. Re-running the sync
  // effects pushes every current signal value (volume, mute, solo, effect
  // amounts) into the new channel immediately (the #212 regression class).
  private resyncSignals(trackId: TrackId): void {
    const signals = this.signalStore.get(trackId);
    const channel = this.mixer.retrieveChannel(trackId);
    if (!signals || !channel) return;
    this.disposeSyncEffects(trackId);
    this.setupChannelSync(trackId, signals, channel);
  }

  private disposeSyncEffects(trackId: TrackId): void {
    const disposers = this.effectDisposers.get(trackId);
    if (disposers) {
      for (const dispose of disposers) dispose();
      this.effectDisposers.delete(trackId);
    }
  }

  private setupChannelSync(
    trackId: TrackId,
    signals: TrackSignals,
    channel: AudioChannel,
  ): void {
    const disposers: Array<() => void> = [];

    // Registered first so the channel has a slider volume before the edit
    // effect below can apply a dim (setDimGainDb is a no-op until then).
    disposers.push(
      effect(() => {
        channel.volume = signals.volume.value;
      }),
    );

    // One effect for dim + mute/solo bypass so their order is fixed: the
    // dim lands (as a snap, while the channel is still muted) before the
    // mute bypass releases — split effects would leave that ordering to
    // the signal library. The bypass acts at the channel level only; the
    // user's signals stay untouched, so exiting edit mode restores them.
    disposers.push(
      effect(() => {
        const editFocus = this._editFocusTrackId.value;
        const isEditFocusActive = editFocus !== null;
        const isDimmed = isEditFocusActive && editFocus !== trackId;
        channel.setDimGainDb(isDimmed ? EDIT_FOCUS_DIM_DB : 0);
        channel.mute = isEditFocusActive ? false : signals.mute.value;
        channel.solo = isEditFocusActive ? false : signals.solo.value;
      }),
    );

    for (const effectId of EFFECT_ORDER) {
      disposers.push(
        effect(() => {
          channel.setEffectAmount(effectId, signals.effects[effectId].value);
        }),
      );
    }

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
