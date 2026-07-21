// Debounced, supersede-safe spectrogram refresh — spec 004 M6 (#494).
//
// After an effect-amount commit, the active track's audio is re-rendered
// post-effect (Tone.Offline) and re-analysed through the CQT pipeline. Two
// invariants matter here: one analysis per settled commit (rapid commits
// coalesce, never one re-analysis per slider tick), and a commit that
// arrives while an analysis is already in flight must win — the stale
// result must never land after the newer one.

import { debounce } from 'throttle-debounce';
import { saveSpectrogramData } from '../project/ProjectStorageService';
import { toSpectrogramStoreData } from '../spectrogram/useSpectrogramCache';
import { type SpectrogramResult } from '../spectrogram/SpectrogramCache';
import { hashEffectAmounts, type EffectAmounts } from '../tracks/EffectsChain';
import { type TrackColor, type TrackId } from '../tracks/types';

export const EFFECTS_REFRESH_DEBOUNCE_MS = 400;

export type EffectsRefreshDeps = {
  renderOffline: (
    audioBuffer: AudioBuffer,
    amounts: EffectAmounts,
  ) => Promise<AudioBuffer>;
  analyseToResult: (
    audioBuffer: AudioBuffer,
    color: TrackColor,
  ) => Promise<SpectrogramResult>;
  setEntry: (
    trackId: TrackId,
    result: SpectrogramResult,
    effectsParamsHash: string,
  ) => void;
  onRefreshed?: (trackId: TrackId) => void;
};

type Debounced = ((
  audioBuffer: AudioBuffer,
  color: TrackColor,
  amounts: EffectAmounts,
) => void) & { cancel: (options?: { upcomingOnly?: boolean }) => void };

export class EffectsRefreshScheduler {
  private deps: EffectsRefreshDeps;
  private scheduled = new Map<TrackId, Debounced>();
  private latestRequestId = new Map<TrackId, number>();
  private nextRequestId = 0;
  private disposed = false;

  constructor(deps: EffectsRefreshDeps) {
    this.deps = deps;
  }

  // Schedules a refresh for `trackId`. Calling this again for the same
  // track before the debounce window elapses replaces the pending amounts
  // (and audioBuffer/color, though those don't change mid-session) rather
  // than queuing a second run.
  schedule(
    trackId: TrackId,
    audioBuffer: AudioBuffer,
    color: TrackColor,
    amounts: EffectAmounts,
  ): void {
    if (this.disposed) return;
    let debounced = this.scheduled.get(trackId);
    if (!debounced) {
      debounced = debounce(
        EFFECTS_REFRESH_DEBOUNCE_MS,
        (buffer: AudioBuffer, col: TrackColor, amt: EffectAmounts) => {
          this.run(trackId, buffer, col, amt);
        },
      ) as Debounced;
      this.scheduled.set(trackId, debounced);
    }
    debounced(audioBuffer, color, amounts);
  }

  // Cancels any pending debounced runs and stops in-flight runs from
  // committing their result. Call on unmount of whatever owns this
  // scheduler instance.
  dispose(): void {
    this.disposed = true;
    for (const debounced of this.scheduled.values()) debounced.cancel();
    this.scheduled.clear();
  }

  private async run(
    trackId: TrackId,
    audioBuffer: AudioBuffer,
    color: TrackColor,
    amounts: EffectAmounts,
  ): Promise<void> {
    const requestId = ++this.nextRequestId;
    this.latestRequestId.set(trackId, requestId);

    const rendered = await this.deps.renderOffline(audioBuffer, amounts);
    if (this.isSuperseded(trackId, requestId)) return;

    const result = await this.deps.analyseToResult(rendered, color);
    if (this.isSuperseded(trackId, requestId)) return;

    const effectsParamsHash = hashEffectAmounts(amounts);
    this.deps.setEntry(trackId, result, effectsParamsHash);

    const storeData = toSpectrogramStoreData(trackId, result.data);
    storeData.effectsParamsHash = effectsParamsHash;
    await saveSpectrogramData(storeData);

    this.deps.onRefreshed?.(trackId);
  }

  private isSuperseded(trackId: TrackId, requestId: number): boolean {
    return this.disposed || this.latestRequestId.get(trackId) !== requestId;
  }
}
