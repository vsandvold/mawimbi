import { type TrackColor } from '../tracks/types';
import { type MelodyData } from '../transcription/MelodyExtractor';
import { type RhythmData } from '../rhythm/RhythmAnalyser';
import OfflineAnalyser, { type SpectrogramData } from './OfflineAnalyser';
import { renderTiles } from './SpectrogramTileRenderer';
import { spectrogramStats } from './SpectrogramStats';
import { type WorkerResponse } from './spectrogram.worker';

export type TrackSpectrogramEntry = {
  data: SpectrogramData;
  tiles: ImageBitmap[];
  melody?: MelodyData;
  rhythm?: RhythmData;
  // Hash of the effect amounts this entry was rendered from (spec 004 M6,
  // hashEffectAmounts). Undefined means dry (pre-effects-refresh data, or
  // never explicitly stamped) — callers treat that as the dry hash.
  effectsParamsHash?: string;
  // False while a chunked analysis (spec 006 M2) is still delivering tiles;
  // true for every atomic delivery (restore, effects-refresh commit) and
  // the final chunk of a progressive one. Lets a consumer that didn't
  // itself call `analyse()` — e.g. a remounted `useSpectrogramCache` that
  // finds this track already cached — tell "safe to treat as final" apart
  // from "must keep listening for more" (review fix, mawimbi#539: without
  // this, a remount mid-analysis silently froze on a partial spectrogram).
  analysisComplete: boolean;
};

export type SpectrogramResult = { data: SpectrogramData; tiles: ImageBitmap[] };

// One completed chunk of a progressive worker analysis (mawimbi#539, spec
// 006 milestone 2) — this chunk's own frames and single tile, not the
// cumulative total; `appendChunk` below does the accumulating.
export type SpectrogramChunk = {
  frames: Uint8Array[];
  tile: ImageBitmap;
  frequencyBinCount: number;
  timeResolution: number;
  sampleRate: number;
};

type PendingSpectrogramRequest = {
  kind: 'spectrogram';
  resolve: (result: SpectrogramResult) => void;
  reject: (error: Error) => void;
  onChunk?: (chunk: SpectrogramChunk) => void;
  // Tiles accumulated from 'chunk' messages for this in-flight request —
  // an ImageBitmap can only be transferred once, so the worker's final
  // 'result' message carries no tiles at all; this is the only place they
  // exist once transferred out of the worker.
  chunkTiles: ImageBitmap[];
  // Frames accumulated from 'chunk' messages, similarly reused to build the
  // final SpectrogramData — the worker's final 'result' message carries
  // only scalar metadata, not the frames again, since every frame was
  // already sent once via 'chunk' (review fix, mawimbi#539: the final
  // message used to re-clone every frame a second time).
  chunkFrames: Uint8Array[];
};

type PendingMelodyRequest = {
  kind: 'melody';
  resolve: (result: MelodyData) => void;
  reject: (error: Error) => void;
};

type PendingRhythmRequest = {
  kind: 'rhythm';
  resolve: (result: RhythmData) => void;
  reject: (error: Error) => void;
};

type PendingRequest =
  | PendingSpectrogramRequest
  | PendingMelodyRequest
  | PendingRhythmRequest;

class SpectrogramCache {
  private entries = new Map<string, TrackSpectrogramEntry>();
  private worker: Worker | null = null;
  private workerFailed = false;
  private nextMessageId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private listeners = new Map<
    string,
    Set<(entry: TrackSpectrogramEntry) => void>
  >();

  // Analyses `audioBuffer` and writes progressively-growing entries into
  // the cache as chunks arrive (mawimbi#539, spec 006 milestone 2), so the
  // first tile is visible well before the whole track finishes analysing.
  // `onProgress` (if given) is called with the freshly-updated entry after
  // every delivery, including the final one — the caller's hook to push
  // that entry into React state without waiting for the returned promise.
  async analyse(
    trackId: string,
    audioBuffer: AudioBuffer,
    color: TrackColor,
    effectsParamsHash?: string,
    onProgress?: (entry: TrackSpectrogramEntry) => void,
  ): Promise<void> {
    const analysisToken = import.meta.env.DEV
      ? spectrogramStats.recordAnalysisStart(trackId)
      : undefined;
    const result = await this.analyseToResult(audioBuffer, color, (chunk) => {
      this.appendChunk(trackId, chunk, effectsParamsHash, analysisToken);
      onProgress?.(this.getEntry(trackId)!);
    });
    this.setEntry(
      trackId,
      result.data,
      result.tiles,
      effectsParamsHash,
      analysisToken,
    );
    onProgress?.(this.getEntry(trackId)!);
  }

  // Runs the analysis (worker, falling back to main thread) without
  // writing it to `entries` — the caller decides when/whether to commit
  // the result. Used directly by the effects-refresh scheduler (spec 004
  // M6, #494) so an in-flight analysis superseded by a newer commit can be
  // discarded instead of clobbering a fresher result. `onChunk` is only
  // meaningful on the worker path — the main-thread fallback still
  // analyses in one pass (its result is byte-identical either way).
  async analyseToResult(
    audioBuffer: AudioBuffer,
    color: TrackColor,
    onChunk?: (chunk: SpectrogramChunk) => void,
  ): Promise<SpectrogramResult> {
    if (this.workerFailed) {
      return this.analyseOnMainThread(audioBuffer, color);
    }
    try {
      return await this.analyseInWorker(audioBuffer, color, onChunk);
    } catch {
      // Worker failed (e.g. OfflineAudioContext unavailable in worker scope)
      this.workerFailed = true;
      return this.analyseOnMainThread(audioBuffer, color);
    }
  }

  // Writes an already-computed result into the cache, preserving any
  // melody already extracted for this track (effects don't change the
  // musical content, so a post-effect refresh must not drop it). Closes
  // any of the previous entry's tiles the new `tiles` array doesn't reuse
  // by reference — a progressive chunk delivery always includes every
  // prior tile (so this is a no-op there), but a full replacement (a
  // worker-error fallback re-render, or an effects-refresh commit) leaves
  // the old ImageBitmaps unreferenced, and nothing closed them before this
  // (review fix, mawimbi#539). Notifies any subscribers registered via
  // `subscribeToEntry` after every write.
  setEntry(
    trackId: string,
    data: SpectrogramData,
    tiles: ImageBitmap[],
    effectsParamsHash?: string,
    analysisToken?: number,
    analysisComplete = true,
  ): void {
    const existing = this.entries.get(trackId);
    if (existing) {
      for (const tile of existing.tiles) {
        if (!tiles.includes(tile)) tile.close();
      }
    }

    const entry: TrackSpectrogramEntry = {
      data,
      tiles,
      melody: existing?.melody,
      rhythm: existing?.rhythm,
      effectsParamsHash,
      analysisComplete,
    };
    this.entries.set(trackId, entry);
    if (import.meta.env.DEV) {
      spectrogramStats.recordEntry(
        trackId,
        tiles,
        data,
        analysisToken,
        analysisComplete,
      );
    }
    this.listeners.get(trackId)?.forEach((callback) => callback(entry));
  }

  // Subscribes to every future entry update for `trackId` — a fresh chunk
  // delivery or a completed analysis — regardless of which `analyse()`
  // call (if any) the subscriber itself initiated. Lets a consumer that
  // finds an already-in-flight, incomplete entry (`analysisComplete:
  // false`) keep receiving updates instead of freezing on that partial
  // snapshot (review fix, mawimbi#539; see `useSpectrogramCache.ts`).
  // Returns an unsubscribe function.
  subscribeToEntry(
    trackId: string,
    callback: (entry: TrackSpectrogramEntry) => void,
  ): () => void {
    let subscribers = this.listeners.get(trackId);
    if (!subscribers) {
      subscribers = new Set();
      this.listeners.set(trackId, subscribers);
    }
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
      if (subscribers.size === 0) this.listeners.delete(trackId);
    };
  }

  restore(
    trackId: string,
    data: SpectrogramData,
    color: TrackColor,
    effectsParamsHash?: string,
  ): void {
    const tiles = renderTiles(data, color);
    this.setEntry(trackId, data, tiles, effectsParamsHash);
  }

  getEntry(trackId: string): TrackSpectrogramEntry | undefined {
    return this.entries.get(trackId);
  }

  getMelody(trackId: string): MelodyData | undefined {
    return this.entries.get(trackId)?.melody;
  }

  setMelody(trackId: string, melody: MelodyData): void {
    const entry = this.entries.get(trackId);
    if (entry) {
      entry.melody = melody;
    }
  }

  getRhythm(trackId: string): RhythmData | undefined {
    return this.entries.get(trackId)?.rhythm;
  }

  setRhythm(trackId: string, rhythm: RhythmData): void {
    const entry = this.entries.get(trackId);
    if (entry) {
      entry.rhythm = rhythm;
    }
  }

  // Releases a persisted entry's raw per-frame columns while keeping its
  // tiles and metadata (bin count, time resolution, duration, totalFrames)
  // intact. Called once a track's spectrogram has been written to
  // IndexedDB (or, for `restore`, was already loaded from there) — the
  // frames' only job was producing the tiles and the persisted bytes;
  // retaining them for the rest of the session is the unbounded-growth
  // path spec 006 M3 fixes (mawimbi#540). A no-op for an unknown track.
  //
  // Builds a fresh `data`/entry object rather than mutating
  // `entry.data.frequencyFrames` in place: `setEntry`/`restore` store the
  // caller's `data` object by reference, un-cloned, so mutating it here
  // would silently empty a `SpectrogramData` object the caller (or a test
  // fixture) might still hold and reuse elsewhere. The cost is that
  // callers holding the old entry (`useSpectrogramCache`'s React state)
  // must explicitly re-fetch via `getEntry` to observe the release — see
  // `releaseFramesAndSync` there.
  releaseFrames(trackId: string): void {
    const entry = this.entries.get(trackId);
    if (!entry) return;
    const releasedData: SpectrogramData = {
      ...entry.data,
      frequencyFrames: [],
    };
    this.entries.set(trackId, { ...entry, data: releasedData });
    if (import.meta.env.DEV) spectrogramStats.releaseFrames(trackId);
  }

  invalidate(trackId: string): void {
    const entry = this.entries.get(trackId);
    if (entry) {
      entry.tiles.forEach((tile) => tile.close());
      this.entries.delete(trackId);
      if (import.meta.env.DEV) spectrogramStats.clearTrack(trackId);
    }
  }

  invalidateAll(): void {
    this.entries.forEach((entry) => {
      entry.tiles.forEach((tile) => tile.close());
    });
    this.entries.clear();
    if (import.meta.env.DEV) spectrogramStats.clearAll();
  }

  extractMelodyInWorker(audioBuffer: AudioBuffer): Promise<MelodyData> {
    const durationSeconds = audioBuffer.length / audioBuffer.sampleRate;
    console.log(
      `[melody] Sending melody extraction to worker: ${audioBuffer.numberOfChannels}ch, ${audioBuffer.length} samples, ${audioBuffer.sampleRate} Hz, ${durationSeconds.toFixed(2)}s`,
    );

    const worker = this.getWorker();
    const id = this.nextMessageId++;

    const channelData: Float32Array[] = [];
    const transferables: Transferable[] = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const copy = new Float32Array(audioBuffer.getChannelData(ch));
      channelData.push(copy);
      transferables.push(copy.buffer);
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { kind: 'melody', resolve, reject });
      worker.postMessage(
        {
          id,
          kind: 'melody',
          channelData,
          sampleRate: audioBuffer.sampleRate,
          length: audioBuffer.length,
        },
        transferables,
      );
    });
  }

  extractRhythmInWorker(audioBuffer: AudioBuffer): Promise<RhythmData> {
    const durationSeconds = audioBuffer.length / audioBuffer.sampleRate;
    console.log(
      `[rhythm] Sending rhythm extraction to worker: ${audioBuffer.numberOfChannels}ch, ${audioBuffer.length} samples, ${audioBuffer.sampleRate} Hz, ${durationSeconds.toFixed(2)}s`,
    );

    const worker = this.getWorker();
    const id = this.nextMessageId++;

    const channelData: Float32Array[] = [];
    const transferables: Transferable[] = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const copy = new Float32Array(audioBuffer.getChannelData(ch));
      channelData.push(copy);
      transferables.push(copy.buffer);
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { kind: 'rhythm', resolve, reject });
      worker.postMessage(
        {
          id,
          kind: 'rhythm',
          channelData,
          sampleRate: audioBuffer.sampleRate,
          length: audioBuffer.length,
        },
        transferables,
      );
    });
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('./spectrogram.worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { id, type } = event.data;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;

        // A 'chunk' delivery doesn't resolve or reject the request — more
        // messages (further chunks, then one final 'result') are still
        // coming for this id, so `pending` stays in the map.
        if (type === 'chunk') {
          if (pending.kind !== 'spectrogram') return;
          pending.chunkTiles.push(event.data.tile);
          pending.chunkFrames.push(...event.data.frames);
          pending.onChunk?.({
            frames: event.data.frames,
            tile: event.data.tile,
            frequencyBinCount: event.data.frequencyBinCount,
            timeResolution: event.data.timeResolution,
            sampleRate: event.data.sampleRate,
          });
          return;
        }

        this.pendingRequests.delete(id);

        if (type === 'error') {
          if (pending.kind === 'melody') {
            console.error(
              `[melody] Worker returned error: ${event.data.message}`,
            );
          }
          pending.reject(new Error(event.data.message));
        } else if (type === 'melody-result' && pending.kind === 'melody') {
          console.log(
            `[melody] Worker returned ${event.data.data.notes.length} notes`,
          );
          pending.resolve(event.data.data);
        } else if (type === 'rhythm-result' && pending.kind === 'rhythm') {
          console.log(
            `[rhythm] Worker returned bpm=${event.data.data.bpm.toFixed(1)}, ${event.data.data.ticks.length} ticks, ${event.data.data.onsets.length} onsets`,
          );
          pending.resolve(event.data.data);
        } else if (type === 'result' && pending.kind === 'spectrogram') {
          // Frames and tiles arrived exclusively via 'chunk' messages above
          // (an ImageBitmap can only be transferred once, and every frame
          // was already cloned across once that way) — the worker's final
          // message carries only scalar metadata, so `data` is built here
          // from what was already accumulated instead of re-cloning every
          // frame a second time (review fix, mawimbi#539).
          const data: SpectrogramData = {
            frequencyFrames: pending.chunkFrames,
            frequencyBinCount: event.data.frequencyBinCount,
            timeResolution: event.data.timeResolution,
            sampleRate: event.data.sampleRate,
            duration: event.data.duration,
            totalFrames: pending.chunkFrames.length,
          };
          pending.resolve({ data, tiles: pending.chunkTiles });
        }
      };
      this.worker.onerror = (event) => {
        console.error('[melody] Spectrogram worker crashed:', event);
        this.workerFailed = true;
        this.rejectAllPending(
          new Error('Spectrogram worker failed; falling back to main thread'),
        );
      };
    }
    return this.worker;
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private analyseInWorker(
    audioBuffer: AudioBuffer,
    color: TrackColor,
    onChunk?: (chunk: SpectrogramChunk) => void,
  ): Promise<SpectrogramResult> {
    const worker = this.getWorker();
    const id = this.nextMessageId++;

    const channelData: Float32Array[] = [];
    const transferables: Transferable[] = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const copy = new Float32Array(audioBuffer.getChannelData(ch));
      channelData.push(copy);
      transferables.push(copy.buffer);
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        kind: 'spectrogram',
        resolve,
        reject,
        onChunk,
        chunkTiles: [],
        chunkFrames: [],
      });
      worker.postMessage(
        {
          id,
          kind: 'spectrogram',
          channelData,
          sampleRate: audioBuffer.sampleRate,
          length: audioBuffer.length,
          color,
        },
        transferables,
      );
    });
  }

  private async analyseOnMainThread(
    audioBuffer: AudioBuffer,
    color: TrackColor,
  ): Promise<SpectrogramResult> {
    const analyser = new OfflineAnalyser(audioBuffer);
    const data = await analyser.analyseToFrames();
    const tiles = renderTiles(data, color);
    return { data, tiles };
  }

  // Merges one incremental chunk into the track's growing entry — always a
  // fresh `frequencyFrames`/`tiles` array (never a mutation of the
  // previous one), satisfying `Spectrogram.tsx`'s reference-identity dirty
  // check (#494; CLAUDE.md). `analysisComplete` stays false until the
  // final, whole-track `setEntry` call in `analyse()` above.
  private appendChunk(
    trackId: string,
    chunk: SpectrogramChunk,
    effectsParamsHash: string | undefined,
    analysisToken: number | undefined,
  ): void {
    const existing = this.entries.get(trackId);
    const frequencyFrames = [
      ...(existing?.data.frequencyFrames ?? []),
      ...chunk.frames,
    ];
    const data: SpectrogramData = {
      frequencyFrames,
      timeResolution: chunk.timeResolution,
      frequencyBinCount: chunk.frequencyBinCount,
      sampleRate: chunk.sampleRate,
      duration: frequencyFrames.length * chunk.timeResolution,
      totalFrames: frequencyFrames.length,
    };
    const tiles = [...(existing?.tiles ?? []), chunk.tile];
    this.setEntry(
      trackId,
      data,
      tiles,
      effectsParamsHash,
      analysisToken,
      false,
    );
  }
}

export default SpectrogramCache;
