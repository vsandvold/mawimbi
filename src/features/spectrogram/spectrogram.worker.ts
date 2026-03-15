// Polyfill `window` for TF.js — must be first import (before Basic Pitch)
import '../../shared/workerWindowPolyfill';

import { type TrackColor } from '../tracks/types';
import { analyseCQT } from './CQTAnalyser';
import {
  type MelodyData,
  extractMelody,
  preWarmBasicPitch,
} from '../transcription/MelodyExtractor';
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

// Pre-warm the Basic Pitch TF.js model after the first CQT analysis
// completes so the model is ready when melody extraction is requested
// later. Failure is non-fatal — CQT analysis continues regardless.
let modelPreWarmed = false;

async function handleSpectrogram(request: AnalyseRequest): Promise<void> {
  const { id, channelData, sampleRate, length, color } = request;

  try {
    const data = analyseCQT(channelData, sampleRate, length);
    const tiles = renderTiles(data, color);
    const response: AnalyseResponse = { id, type: 'result', data, tiles };
    workerSelf.postMessage(response, tiles as unknown as Transferable[]);

    if (!modelPreWarmed) {
      modelPreWarmed = true;
      console.debug('[melody] Pre-warming Basic Pitch model in worker...');
      preWarmBasicPitch();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: AnalyseResponse = { id, type: 'error', message };
    workerSelf.postMessage(response);
  }
}

async function handleMelody(request: MelodyRequest): Promise<void> {
  const { id, channelData, sampleRate, length } = request;
  const durationSeconds = length / sampleRate;

  console.log(
    `[melody] Worker received melody request: ${channelData.length}ch, ${length} samples, ${sampleRate} Hz, ${durationSeconds.toFixed(2)}s`,
  );

  try {
    const mono = mixToMono(channelData, length);
    console.debug(
      `[melody] Mixed ${channelData.length} channels to mono (${mono.length} samples)`,
    );
    const data = await extractMelody(mono, sampleRate);
    console.log(
      `[melody] Worker melody extraction complete: ${data.notes.length} notes`,
    );
    const response: MelodyResponse = { id, type: 'melody-result', data };
    workerSelf.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[melody] Worker melody extraction failed: ${message}`);
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
