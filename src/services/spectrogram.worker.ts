import { type TrackColor } from '../types/track';
import { type SpectrogramData } from './OfflineAnalyser';
import { renderTiles } from './SpectrogramTileRenderer';

const FFT_SIZE = 4096;
const SMOOTHING_TIME_CONSTANT = 0;
const MIN_DECIBELS = -80;
const MAX_DECIBELS = -30;
const SUSPEND_INTERVAL = 0.025;

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

/**
 * Logarithmic frequency mapping — identical to OfflineAnalyser.createLogFrequencyMapping.
 *
 * Maps linear FFT bins to perceptual (log-spaced) bins. Lower bins pool
 * multiple linear bins together, compressing the high-frequency region
 * and expanding the low-frequency region for musical relevance.
 */
export function createLogFrequencyMapping(
  frequencyBinCount: number,
): number[][] {
  const mapping: number[][] = new Array(frequencyBinCount);
  const lower = 1;
  const upper = frequencyBinCount + 1;
  const b = Math.log(lower / upper) / (lower - upper);
  for (let i = 0; i < frequencyBinCount; i++) {
    const logIdx = Math.trunc(Math.exp(b * i)) - 1;
    mapping[i] = [logIdx];
  }
  for (let i = 0; i < frequencyBinCount - 1; i++) {
    const df = mapping[i + 1][0] - mapping[i][0];
    if (df === 1) {
      continue;
    }
    for (let j = 1; j <= df; j++) {
      mapping[i].push(mapping[i][0] + j);
    }
  }
  return mapping;
}

/**
 * FFT analysis producing log-frequency spectrogram frames —
 * replicates OfflineAnalyser.analyseToFrames for use in the worker thread
 * (no `window.` prefix, no ScriptProcessorNode fallback).
 */
export async function analyseToFrames(
  channelData: Float32Array[],
  sampleRate: number,
  length: number,
): Promise<SpectrogramData> {
  const numChannels = channelData.length;
  const duration = length / sampleRate;

  const offlineContext = new OfflineAudioContext(
    numChannels,
    length,
    sampleRate,
  );

  const analyser = offlineContext.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
  analyser.minDecibels = MIN_DECIBELS;
  analyser.maxDecibels = MAX_DECIBELS;

  const binCount = analyser.frequencyBinCount;
  const logMapping = createLogFrequencyMapping(binCount);

  const frequencyFrames: Uint8Array[] = [];
  const frequencyData = new Uint8Array(binCount);
  const tempBuffer = new Uint8Array(binCount);

  const collectFrame = () => {
    analyser.getByteFrequencyData(frequencyData);
    for (let i = 0; i < binCount; i++) {
      tempBuffer[i] = frequencyData[i];
    }
    for (let i = 0; i < binCount; i++) {
      frequencyData[i] = 0;
      const pool = logMapping[i];
      for (let j = 0; j < pool.length; j++) {
        frequencyData[i] += tempBuffer[pool[j]];
      }
    }
    frequencyFrames.push(new Uint8Array(frequencyData));
  };

  const audioBuffer = offlineContext.createBuffer(
    numChannels,
    length,
    sampleRate,
  );
  for (let ch = 0; ch < numChannels; ch++) {
    audioBuffer.copyToChannel(
      new Float32Array(channelData[ch]) as Float32Array<ArrayBuffer>,
      ch,
    );
  }

  const bufferSource = offlineContext.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(analyser);
  analyser.connect(offlineContext.destination);

  let suspendTime = SUSPEND_INTERVAL;
  while (suspendTime < duration) {
    offlineContext
      .suspend(suspendTime)
      .then(() => {
        collectFrame();
        offlineContext.resume();
      })
      .catch((error) => console.log(error));
    suspendTime += SUSPEND_INTERVAL;
  }

  bufferSource.start(0);
  await offlineContext.startRendering();

  return {
    frequencyFrames,
    timeResolution: SUSPEND_INTERVAL,
    frequencyBinCount: binCount,
    sampleRate,
    duration,
  };
}

// TypeScript sees `self` as Window (DOM lib), but in a worker it is
// DedicatedWorkerGlobalScope with a different postMessage signature.
type WorkerSelf = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
  postMessage(message: unknown): void;
};

const workerSelf = self as unknown as WorkerSelf;

workerSelf.onmessage = async (event: MessageEvent<AnalyseRequest>) => {
  const { id, channelData, sampleRate, length, color } = event.data;

  try {
    const data = await analyseToFrames(channelData, sampleRate, length);
    const tiles = renderTiles(data, color);
    const response: AnalyseResponse = { id, type: 'result', data, tiles };
    workerSelf.postMessage(response, tiles as unknown as Transferable[]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: AnalyseResponse = { id, type: 'error', message };
    workerSelf.postMessage(response);
  }
};
