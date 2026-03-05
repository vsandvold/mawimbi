import { vi } from 'vitest';
import {
  BAND_CONFIGS,
  calculateMultiBandMergeParams,
} from '../dualBandAnalysis';
import { createLogFrequencyMapping } from '../logFrequencyMapping';
import { analyseCQT, computeNumberBins, HOP_SECONDS } from '../CQTAnalyser';

const LOG_MAPPING_BIN_COUNT = 512;
const BAND_COUNT = BAND_CONFIGS.length;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createLogFrequencyMapping', () => {
  it('produces a mapping array with length equal to frequencyBinCount', () => {
    const mapping = createLogFrequencyMapping(LOG_MAPPING_BIN_COUNT);

    expect(mapping.length).toBe(LOG_MAPPING_BIN_COUNT);
  });

  it('produces mapping entries that are arrays of at least one index', () => {
    const mapping = createLogFrequencyMapping(LOG_MAPPING_BIN_COUNT);

    for (const entry of mapping) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('has higher bins mapping to more entries than lower bins', () => {
    const mapping = createLogFrequencyMapping(LOG_MAPPING_BIN_COUNT);

    const lastBinPoolSize = mapping[mapping.length - 1].length;
    const firstBinPoolSize = mapping[0].length;

    expect(lastBinPoolSize).toBeGreaterThanOrEqual(firstBinPoolSize);
  });

  it('produces consistent results for the same input', () => {
    const mapping1 = createLogFrequencyMapping(512);
    const mapping2 = createLogFrequencyMapping(512);

    expect(mapping1).toEqual(mapping2);
  });

  it('handles small bin counts', () => {
    const mapping = createLogFrequencyMapping(4);

    expect(mapping.length).toBe(4);
    for (const entry of mapping) {
      expect(entry.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('calculateMultiBandMergeParams', () => {
  it('returns correct merge parameters for 44100 Hz', () => {
    const params = calculateMultiBandMergeParams(44100);

    expect(params.bands.length).toBe(BAND_COUNT);

    // Band 0: SR=5120, FFT=2048
    expect(params.bands[0].binWidth).toBe(2.5);
    expect(params.bands[0].startBin).toBe(0);
    expect(params.bands[0].endBin).toBe(128); // ceil(320/2.5)

    // Band 1: SR=5120, FFT=512
    expect(params.bands[1].binWidth).toBe(10);
    expect(params.bands[1].startBin).toBe(32); // ceil(320/10)
    expect(params.bands[1].endBin).toBe(128); // ceil(1280/10)

    // Band 3: SR=44100, FFT=1024 (native)
    expect(params.bands[3].sampleRate).toBe(44100);
    expect(params.bands[3].binWidth).toBeCloseTo(43.066, 2);

    // Total merged bins should be positive and reasonable
    expect(params.mergedBinCount).toBeGreaterThan(0);
    expect(params.mergedBinCount).toBeLessThan(2000);
  });

  it('returns correct merge parameters for 48000 Hz', () => {
    const params = calculateMultiBandMergeParams(48000);

    expect(params.bands.length).toBe(BAND_COUNT);

    // Band 0 stays the same (SR=5120 is independent of native rate)
    expect(params.bands[0].binWidth).toBe(2.5);

    // Band 3 uses native rate
    expect(params.bands[3].sampleRate).toBe(48000);
    expect(params.bands[3].binWidth).toBeCloseTo(46.875, 2);
  });
});

describe('analyseCQT (worker path)', () => {
  it('returns SpectrogramData with correct metadata', () => {
    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    const channelData = [new Float32Array(length)];
    const expectedBins = computeNumberBins(sampleRate);

    const result = analyseCQT(channelData, sampleRate, length);

    expect(result.sampleRate).toBe(sampleRate);
    expect(result.duration).toBeCloseTo(0.1, 2);
    expect(result.frequencyBinCount).toBe(expectedBins);
    expect(result.timeResolution).toBe(HOP_SECONDS);
    expect(result.frequencyFrames).toBeInstanceOf(Array);
  });

  it('collects the expected number of frames', () => {
    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    const channelData = [new Float32Array(length)];

    const result = analyseCQT(channelData, sampleRate, length);

    // 100ms at 25ms hop → 4 frames (floor(0.1 / 0.025))
    expect(result.frequencyFrames.length).toBe(4);
  });

  it('stores each frame as an independent Uint8Array', () => {
    const sampleRate = 44100;
    const expectedBins = computeNumberBins(sampleRate);
    const length = Math.ceil(0.1 * sampleRate);
    const channelData = [new Float32Array(length)];

    const result = analyseCQT(channelData, sampleRate, length);

    for (const frame of result.frequencyFrames) {
      expect(frame).toBeInstanceOf(Uint8Array);
      expect(frame.length).toBe(expectedBins);
    }

    if (result.frequencyFrames.length >= 2) {
      expect(result.frequencyFrames[0]).not.toBe(result.frequencyFrames[1]);
    }
  });

  it('produces all-zero frames for silence', () => {
    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    const channelData = [new Float32Array(length)];

    const result = analyseCQT(channelData, sampleRate, length);

    for (const frame of result.frequencyFrames) {
      expect(frame.every((v) => v === 0)).toBe(true);
    }
  });

  it('detects a sine wave at the correct CQ bin', () => {
    const sampleRate = 44100;
    const duration = 0.5;
    const length = Math.ceil(duration * sampleRate);
    const signal = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      signal[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const result = analyseCQT([signal], sampleRate, length);

    const expectedBin = Math.round(24 * Math.log2(440 / 32.7));

    const midFrame =
      result.frequencyFrames[Math.floor(result.frequencyFrames.length / 2)];
    let peakBin = 0;
    for (let i = 1; i < midFrame.length; i++) {
      if (midFrame[i] > midFrame[peakBin]) peakBin = i;
    }

    expect(Math.abs(peakBin - expectedBin)).toBeLessThanOrEqual(1);
  });

  it('handles multi-channel input by mixing to mono', () => {
    const sampleRate = 44100;
    const length = Math.ceil(0.1 * sampleRate);
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      left[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const result = analyseCQT([left, right], sampleRate, length);

    const midFrame =
      result.frequencyFrames[Math.floor(result.frequencyFrames.length / 2)];
    expect(midFrame.some((v) => v > 0)).toBe(true);
  });
});
