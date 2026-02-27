import { type TrackColor } from '../types/track';
import OfflineAnalyser, { type SpectrogramData } from './OfflineAnalyser';
import { renderTiles } from './SpectrogramTileRenderer';
import { type AnalyseResponse } from './spectrogram.worker';

export type TrackSpectrogramEntry = {
  data: SpectrogramData;
  tiles: ImageBitmap[];
};

type PendingRequest = {
  resolve: (result: { data: SpectrogramData; tiles: ImageBitmap[] }) => void;
  reject: (error: Error) => void;
};

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
    let result: { data: SpectrogramData; tiles: ImageBitmap[] };
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

  getEntry(trackId: string): TrackSpectrogramEntry | undefined {
    return this.entries.get(trackId);
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

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('./spectrogram.worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = (event: MessageEvent<AnalyseResponse>) => {
        const { id, type } = event.data;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;
        this.pendingRequests.delete(id);

        if (type === 'error') {
          pending.reject(new Error(event.data.message));
        } else {
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
  ): Promise<{ data: SpectrogramData; tiles: ImageBitmap[] }> {
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
      this.pendingRequests.set(id, { resolve, reject });
      worker.postMessage(
        {
          id,
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
  ): Promise<{ data: SpectrogramData; tiles: ImageBitmap[] }> {
    const analyser = new OfflineAnalyser(audioBuffer);
    const data = await analyser.analyseToFrames();
    const tiles = renderTiles(data, color);
    return { data, tiles };
  }
}

export default SpectrogramCache;
