import { type TrackColor } from '../types/track';
import { type MelodyData } from './MelodyExtractor';
import OfflineAnalyser, { type SpectrogramData } from './OfflineAnalyser';
import { renderTiles } from './SpectrogramTileRenderer';
import { type WorkerResponse } from './spectrogram.worker';

export type TrackSpectrogramEntry = {
  data: SpectrogramData;
  tiles: ImageBitmap[];
  melody?: MelodyData;
};

type SpectrogramResult = { data: SpectrogramData; tiles: ImageBitmap[] };

type PendingSpectrogramRequest = {
  kind: 'spectrogram';
  resolve: (result: SpectrogramResult) => void;
  reject: (error: Error) => void;
};

type PendingMelodyRequest = {
  kind: 'melody';
  resolve: (result: MelodyData) => void;
  reject: (error: Error) => void;
};

type PendingRequest = PendingSpectrogramRequest | PendingMelodyRequest;

class SpectrogramCache {
  private entries = new Map<string, TrackSpectrogramEntry>();
  private worker: Worker | null = null;
  private workerFailed = false;
  private nextMessageId = 0;
  private pendingRequests = new Map<number, PendingRequest>();

  async analyse(
    trackId: string,
    audioBuffer: AudioBuffer,
    color: TrackColor,
  ): Promise<void> {
    let result: SpectrogramResult;
    if (this.workerFailed) {
      result = await this.analyseOnMainThread(audioBuffer, color);
    } else {
      try {
        result = await this.analyseInWorker(audioBuffer, color);
      } catch {
        // Worker failed (e.g. OfflineAudioContext unavailable in worker scope)
        this.workerFailed = true;
        result = await this.analyseOnMainThread(audioBuffer, color);
      }
    }
    this.entries.set(trackId, { data: result.data, tiles: result.tiles });
  }

  restore(trackId: string, data: SpectrogramData, color: TrackColor): void {
    const tiles = renderTiles(data, color);
    this.entries.set(trackId, { data, tiles });
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

  invalidate(trackId: string): void {
    const entry = this.entries.get(trackId);
    if (entry) {
      entry.tiles.forEach((tile) => tile.close());
      this.entries.delete(trackId);
    }
  }

  invalidateAll(): void {
    this.entries.forEach((entry) => {
      entry.tiles.forEach((tile) => tile.close());
    });
    this.entries.clear();
  }

  extractMelodyInWorker(audioBuffer: AudioBuffer): Promise<MelodyData> {
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
        this.pendingRequests.delete(id);

        if (type === 'error') {
          pending.reject(new Error(event.data.message));
        } else if (type === 'melody-result' && pending.kind === 'melody') {
          pending.resolve(event.data.data);
        } else if (type === 'result' && pending.kind === 'spectrogram') {
          pending.resolve({ data: event.data.data, tiles: event.data.tiles });
        }
      };
      this.worker.onerror = () => {
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
      this.pendingRequests.set(id, { kind: 'spectrogram', resolve, reject });
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
}

export default SpectrogramCache;
