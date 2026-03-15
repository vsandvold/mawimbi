import { vi } from 'vitest';
import { analyseCQT, computeNumberBins, HOP_SECONDS } from '../CQTAnalyser';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
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
