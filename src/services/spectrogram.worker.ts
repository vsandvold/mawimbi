import { type TrackColor } from '../types/track';
import {
  BAND_CONFIGS,
  type BandMergeInfo,
  calculateMultiBandMergeParams,
  createMergedLogMapping,
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

type FilterSpec = {
  type: BiquadFilterType;
  frequency: number;
};

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
 * Builds the filter specs for a band by index.
 *
 * - First band: lowpass only
 * - Last band: highpass only
 * - Middle bands: highpass + lowpass
 */
function buildFilters(bandIndex: number): FilterSpec[] {
  const config = BAND_CONFIGS[bandIndex];
  const filters: FilterSpec[] = [];
  if (config.lowerFreq > 0) {
    filters.push({ type: 'highpass', frequency: config.lowerFreq });
  }
  if (config.upperFreq > 0) {
    filters.push({ type: 'lowpass', frequency: config.upperFreq });
  }
  return filters;
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
  filters: FilterSpec[],
  fftSize: number,
): Promise<Uint8Array[]> {
  const numChannels = channelData.length;
  const contextLength = Math.ceil(duration * contextSampleRate);

  const context = new OfflineAudioContext(
    numChannels,
    contextLength,
    contextSampleRate,
  );

  // Build filter chain
  const filterNodes = filters.map((spec) => {
    const filter = context.createBiquadFilter();
    filter.type = spec.type;
    filter.frequency.value = spec.frequency;
    return filter;
  });

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

  // Wire: source → filter[0] → ... → filter[N-1] → analyser
  if (filterNodes.length === 0) {
    bufferSource.connect(analyser);
  } else {
    bufferSource.connect(filterNodes[0]);
    for (let i = 1; i < filterNodes.length; i++) {
      filterNodes[i - 1].connect(filterNodes[i]);
    }
    filterNodes[filterNodes.length - 1].connect(analyser);
  }

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
 * Copies the relevant FFT bins from each band's frame into the
 * merged array.
 */
function mergeBands(
  merged: Uint8Array,
  bandFrames: Uint8Array[][],
  bands: BandMergeInfo[],
  frameIndex: number,
): void {
  let offset = 0;
  for (let b = 0; b < bands.length; b++) {
    const band = bands[b];
    const frame = bandFrames[b][frameIndex];
    for (let i = 0; i < band.binCount; i++) {
      merged[offset + i] = frame[band.startBin + i];
    }
    offset += band.binCount;
  }
}

/**
 * Multi-band FFT analysis producing log-frequency spectrogram frames.
 *
 * Splits the signal into four bands with geometrically spaced boundaries,
 * each analysed in a separate OfflineAudioContext at a sample rate and
 * FFT size chosen to approximate constant-Q resolution. The bands are
 * merged and log-frequency mapped into a single spectrogram.
 */
export async function analyseToFrames(
  channelData: Float32Array[],
  sampleRate: number,
  length: number,
): Promise<SpectrogramData> {
  const duration = length / sampleRate;

  const bandFrames = await Promise.all(
    BAND_CONFIGS.map((config, i) => {
      const sr = config.sampleRate || sampleRate;
      const filters = buildFilters(i);
      return analyseBand(
        channelData,
        sampleRate,
        length,
        duration,
        sr,
        filters,
        config.fftSize,
      );
    }),
  );

  const params = calculateMultiBandMergeParams(sampleRate);
  const { bands, mergedBinCount } = params;

  const logMapping = createMergedLogMapping(sampleRate);
  const frameCount = Math.min(...bandFrames.map((f) => f.length));
  const frequencyFrames: Uint8Array[] = [];
  const mergedData = new Uint8Array(mergedBinCount);
  const tempBuffer = new Uint8Array(mergedBinCount);

  for (let f = 0; f < frameCount; f++) {
    mergeBands(mergedData, bandFrames, bands, f);
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
