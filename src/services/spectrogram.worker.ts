import { type TrackColor } from '../types/track';
import { analyseCQT } from './CQTAnalyser';
import { getEssentia } from './essentiaLoader';
import { type SpectrogramData } from './OfflineAnalyser';
import { renderTiles } from './SpectrogramTileRenderer';

export type AnalyseRequest = {
  id: number;
  channelData: Float32Array[];
  sampleRate: number;
  length: number;
  color: TrackColor;
};

export type AnalyseResponse =
  | { id: number; type: 'result'; data: SpectrogramData; tiles: ImageBitmap[] }
  | { id: number; type: 'error'; message: string };

// TypeScript sees `self` as Window (DOM lib), but in a worker it is
// DedicatedWorkerGlobalScope with a different postMessage signature.
type WorkerSelf = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
  postMessage(message: unknown): void;
};

const workerSelf = self as unknown as WorkerSelf;

// Pre-warm essentia WASM after the first CQT analysis completes so the
// module is ready when melody extraction is requested later. Failure is
// non-fatal — CQT analysis continues to work regardless.
function preWarmEssentia(): void {
  getEssentia().catch(() => {
    // Silently ignore — essentia is optional for spectrogram rendering.
    // Melody extraction will retry initialization when invoked.
  });
}

let essentiaPreWarmed = false;

workerSelf.onmessage = async (event: MessageEvent<AnalyseRequest>) => {
  const { id, channelData, sampleRate, length, color } = event.data;

  try {
    const data = analyseCQT(channelData, sampleRate, length);
    const tiles = renderTiles(data, color);
    const response: AnalyseResponse = { id, type: 'result', data, tiles };
    workerSelf.postMessage(response, tiles as unknown as Transferable[]);

    if (!essentiaPreWarmed) {
      essentiaPreWarmed = true;
      preWarmEssentia();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: AnalyseResponse = { id, type: 'error', message };
    workerSelf.postMessage(response);
  }
};
