import { type TrackColor } from '../types/track';
import { analyseCQT } from './CQTAnalyser';
import { getEssentia } from './essentiaLoader';
import { type MelodyData, extractMelody } from './MelodyExtractor';
import { mixToMono } from './CQTAnalyser';
import { type SpectrogramData } from './OfflineAnalyser';
import { renderTiles } from './SpectrogramTileRenderer';

// ---------------------------------------------------------------------------
// Message protocol
// ---------------------------------------------------------------------------

export type AnalyseRequest = {
  id: number;
  kind: 'spectrogram';
  channelData: Float32Array[];
  sampleRate: number;
  length: number;
  color: TrackColor;
};

export type MelodyRequest = {
  id: number;
  kind: 'melody';
  channelData: Float32Array[];
  sampleRate: number;
  length: number;
};

export type WorkerRequest = AnalyseRequest | MelodyRequest;

export type AnalyseResponse =
  | { id: number; type: 'result'; data: SpectrogramData; tiles: ImageBitmap[] }
  | { id: number; type: 'error'; message: string };

export type MelodyResponse =
  | { id: number; type: 'melody-result'; data: MelodyData }
  | { id: number; type: 'error'; message: string };

export type WorkerResponse = AnalyseResponse | MelodyResponse;

// ---------------------------------------------------------------------------
// Worker implementation
// ---------------------------------------------------------------------------

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

async function handleSpectrogram(request: AnalyseRequest): Promise<void> {
  const { id, channelData, sampleRate, length, color } = request;

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
}

async function handleMelody(request: MelodyRequest): Promise<void> {
  const { id, channelData, sampleRate, length } = request;

  try {
    const mono = mixToMono(channelData, length);
    const data = await extractMelody(mono, sampleRate);
    const response: MelodyResponse = { id, type: 'melody-result', data };
    workerSelf.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: MelodyResponse = { id, type: 'error', message };
    workerSelf.postMessage(response);
  }
}

workerSelf.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  // Backwards compatibility: messages without `kind` are spectrogram requests
  const kind = request.kind ?? 'spectrogram';

  if (kind === 'melody') {
    await handleMelody(request as MelodyRequest);
  } else {
    await handleSpectrogram(request as AnalyseRequest);
  }
};
