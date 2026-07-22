// Polyfill `window` for TF.js — must be first import (before Basic Pitch)
import '../../shared/workerWindowPolyfill';

import { type TrackColor } from '../tracks/types';
import { analyseCQTChunked, HOP_SECONDS, mixToMono } from './CQTAnalyser';
import {
  type MelodyData,
  extractMelody,
  preWarmBasicPitch,
} from '../transcription/MelodyExtractor';
import { type SpectrogramData } from './OfflineAnalyser';
import { renderTiles } from './SpectrogramTileRenderer';
import { TILE_FRAMES } from './tileConstants';

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

// Emitted once per completed chunk during progressive analysis (mawimbi#539,
// spec 006 milestone 2) — the chunk's own frames and single rendered tile,
// not the cumulative total (SpectrogramCache accumulates across deliveries).
// Sent before the final 'result' message, which carries no frames or tiles
// of its own: every frame and tile was already sent exactly once via
// 'chunk' (an ImageBitmap can't be transferred twice, and re-sending every
// frame again in the final message would clone the whole track's data a
// second time for no reason — review fix, mawimbi#539).
export type AnalyseChunkResponse = {
  id: number;
  type: 'chunk';
  frames: Uint8Array[];
  startFrame: number;
  tile: ImageBitmap;
  frequencyBinCount: number;
  timeResolution: number;
  sampleRate: number;
};

// Scalar metadata only — SpectrogramCache reconstructs the full
// SpectrogramData from the frames it already accumulated via 'chunk'
// messages, rather than receiving them a second time here.
export type AnalyseResultResponse = {
  id: number;
  type: 'result';
  frequencyBinCount: number;
  timeResolution: number;
  sampleRate: number;
  duration: number;
};

export type AnalyseResponse =
  | AnalyseResultResponse
  | AnalyseChunkResponse
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
    const data = analyseCQTChunked(
      channelData,
      sampleRate,
      length,
      TILE_FRAMES,
      (frames, startFrame) => {
        const chunkData: SpectrogramData = {
          frequencyFrames: frames,
          timeResolution: HOP_SECONDS,
          frequencyBinCount: frames[0].length,
          sampleRate,
          duration: frames.length * HOP_SECONDS,
        };
        const [tile] = renderTiles(chunkData, color, TILE_FRAMES);
        const chunkResponse: AnalyseChunkResponse = {
          id,
          type: 'chunk',
          frames,
          startFrame,
          tile,
          frequencyBinCount: chunkData.frequencyBinCount,
          timeResolution: HOP_SECONDS,
          sampleRate,
        };
        workerSelf.postMessage(chunkResponse, [tile]);
      },
    );
    const response: AnalyseResponse = {
      id,
      type: 'result',
      frequencyBinCount: data.frequencyBinCount,
      timeResolution: data.timeResolution,
      sampleRate: data.sampleRate,
      duration: data.duration,
    };
    workerSelf.postMessage(response);

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
