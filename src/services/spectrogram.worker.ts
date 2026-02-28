import { type TrackColor } from '../types/track';
import { createLogFrequencyMapping } from './logFrequencyMapping';
import { type SpectrogramData } from './OfflineAnalyser';
import { renderTiles } from './SpectrogramTileRenderer';

const DUAL_BAND_FFT_SIZE = 1024;
const SMOOTHING_TIME_CONSTANT = 0;
const MIN_DECIBELS = -80;
const MAX_DECIBELS = -30;
const SUSPEND_INTERVAL = 0.025;
const SPLIT_FREQUENCY = 752;

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

function createAnalyserNode(context: OfflineAudioContext): AnalyserNode {
  const analyser = context.createAnalyser();
  analyser.fftSize = DUAL_BAND_FFT_SIZE;
  analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
  analyser.minDecibels = MIN_DECIBELS;
  analyser.maxDecibels = MAX_DECIBELS;
  return analyser;
}

/**
 * Dual-band FFT analysis producing log-frequency spectrogram frames.
 *
 * Splits the signal at ~752 Hz with a lowpass/highpass filter pair,
 * runs separate 1024-point FFTs on each band, then merges the results
 * into a single log-frequency spectrogram. The low band benefits from
 * improved dynamic range (high-frequency energy no longer masks bass),
 * producing a more detailed bass region in the spectrogram.
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

  const lowpassFilter = offlineContext.createBiquadFilter();
  lowpassFilter.type = 'lowpass';
  lowpassFilter.frequency.value = SPLIT_FREQUENCY;

  const highpassFilter = offlineContext.createBiquadFilter();
  highpassFilter.type = 'highpass';
  highpassFilter.frequency.value = SPLIT_FREQUENCY;

  const analyserLow = createAnalyserNode(offlineContext);
  const analyserHigh = createAnalyserNode(offlineContext);

  const binCount = analyserLow.frequencyBinCount;
  const splitBin = Math.round(
    SPLIT_FREQUENCY / (sampleRate / DUAL_BAND_FFT_SIZE),
  );
  const logMapping = createLogFrequencyMapping(binCount);

  const frequencyFrames: Uint8Array[] = [];
  const lowData = new Uint8Array(binCount);
  const highData = new Uint8Array(binCount);
  const mergedData = new Uint8Array(binCount);
  const tempBuffer = new Uint8Array(binCount);

  const collectFrame = () => {
    analyserLow.getByteFrequencyData(lowData);
    analyserHigh.getByteFrequencyData(highData);

    for (let i = 0; i < binCount; i++) {
      mergedData[i] = i < splitBin ? lowData[i] : highData[i];
    }

    for (let i = 0; i < binCount; i++) {
      tempBuffer[i] = mergedData[i];
    }
    for (let i = 0; i < binCount; i++) {
      mergedData[i] = 0;
      const pool = logMapping[i];
      for (let j = 0; j < pool.length; j++) {
        mergedData[i] += tempBuffer[pool[j]];
      }
    }
    frequencyFrames.push(new Uint8Array(mergedData));
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

  bufferSource.connect(lowpassFilter);
  bufferSource.connect(highpassFilter);
  lowpassFilter.connect(analyserLow);
  highpassFilter.connect(analyserHigh);
  analyserLow.connect(offlineContext.destination);
  analyserHigh.connect(offlineContext.destination);

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
