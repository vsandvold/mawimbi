import { type TrackColor } from '../types/track';
import {
  calculateMergeParams,
  createMergedLogMapping,
  HIGH_BAND_FFT_SIZE,
  LOW_BAND_FFT_SIZE,
  LOW_BAND_SAMPLE_RATE,
  SPLIT_FREQUENCY,
} from './dualBandAnalysis';
import { applyLogFrequencyMapping } from './logFrequencyMapping';
import { type SpectrogramData } from './OfflineAnalyser';
import { renderTiles } from './SpectrogramTileRenderer';

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

function createAnalyserNode(
  context: OfflineAudioContext,
  fftSize: number,
): AnalyserNode {
  const analyser = context.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
  analyser.minDecibels = MIN_DECIBELS;
  analyser.maxDecibels = MAX_DECIBELS;
  return analyser;
}

/**
 * Runs FFT analysis on a single frequency band, collecting raw frequency
 * frames at regular suspend intervals.
 *
 * The audio buffer is created at `sampleRate` (the original rate).
 * When `contextSampleRate` differs (e.g. 5120 Hz for the low band),
 * the OfflineAudioContext automatically resamples during playback,
 * concentrating the FFT bins into a narrower frequency range.
 */
async function analyseBand(
  channelData: Float32Array[],
  sampleRate: number,
  length: number,
  duration: number,
  contextSampleRate: number,
  filterType: BiquadFilterType,
  fftSize: number,
): Promise<Uint8Array[]> {
  const numChannels = channelData.length;
  const contextLength = Math.ceil(duration * contextSampleRate);

  const context = new OfflineAudioContext(
    numChannels,
    contextLength,
    contextSampleRate,
  );

  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = SPLIT_FREQUENCY;

  const analyser = createAnalyserNode(context, fftSize);

  const audioBuffer = context.createBuffer(numChannels, length, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    audioBuffer.copyToChannel(
      new Float32Array(channelData[ch]) as Float32Array<ArrayBuffer>,
      ch,
    );
  }

  const bufferSource = context.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(filter);
  filter.connect(analyser);
  analyser.connect(context.destination);

  const binCount = analyser.frequencyBinCount;
  const frames: Uint8Array[] = [];
  const frequencyData = new Uint8Array(binCount);

  let suspendTime = SUSPEND_INTERVAL;
  while (suspendTime < duration) {
    context
      .suspend(suspendTime)
      .then(() => {
        analyser.getByteFrequencyData(frequencyData);
        frames.push(new Uint8Array(frequencyData));
        context.resume();
      })
      .catch((error) => console.log(error));
    suspendTime += SUSPEND_INTERVAL;
  }

  bufferSource.start(0);
  await context.startRendering();

  return frames;
}

/**
 * Dual-band FFT analysis producing log-frequency spectrogram frames.
 *
 * Splits the signal at ~752 Hz with separate OfflineAudioContexts:
 * the low band runs at 5120 Hz with a 2048-point FFT for ~4× finer
 * frequency resolution in the bass range (301 bins vs 70), achieving
 * semitone discrimination down to ~42 Hz. The high band runs at the
 * original sample rate with a 1024-point FFT. The two bands are merged
 * and log-frequency mapped into a single spectrogram.
 */
export async function analyseToFrames(
  channelData: Float32Array[],
  sampleRate: number,
  length: number,
): Promise<SpectrogramData> {
  const duration = length / sampleRate;

  const [lowFrames, highFrames] = await Promise.all([
    analyseBand(
      channelData,
      sampleRate,
      length,
      duration,
      LOW_BAND_SAMPLE_RATE,
      'lowpass',
      LOW_BAND_FFT_SIZE,
    ),
    analyseBand(
      channelData,
      sampleRate,
      length,
      duration,
      sampleRate,
      'highpass',
      HIGH_BAND_FFT_SIZE,
    ),
  ]);

  const { lowBinCount, highBinStart, highBinEnd, mergedBinCount } =
    calculateMergeParams(sampleRate);

  const logMapping = createMergedLogMapping(sampleRate);
  const frameCount = Math.min(lowFrames.length, highFrames.length);
  const frequencyFrames: Uint8Array[] = [];
  const mergedData = new Uint8Array(mergedBinCount);
  const tempBuffer = new Uint8Array(mergedBinCount);

  for (let f = 0; f < frameCount; f++) {
    for (let i = 0; i < lowBinCount; i++) {
      mergedData[i] = lowFrames[f][i];
    }
    for (let i = highBinStart; i < highBinEnd; i++) {
      mergedData[lowBinCount + i - highBinStart] = highFrames[f][i];
    }

    tempBuffer.set(mergedData);
    applyLogFrequencyMapping(tempBuffer, logMapping, mergedData);
    frequencyFrames.push(new Uint8Array(mergedData));
  }

  return {
    frequencyFrames,
    timeResolution: SUSPEND_INTERVAL,
    frequencyBinCount: mergedBinCount,
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
