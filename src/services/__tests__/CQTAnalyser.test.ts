import {
  analyseCQT,
  analyseCQTFromAudioBuffer,
  BINS_PER_OCTAVE,
  computeKernel,
  computeNumberBins,
  HOP_SECONDS,
  magnitudeToByte,
  MAX_DECIBELS,
  MIN_DECIBELS,
  MIN_FREQUENCY,
  mixToMono,
  Q_FACTOR,
} from '../CQTAnalyser';
import { vi } from 'vitest';

const SAMPLE_RATE = 44100;

describe('computeNumberBins', () => {
  it('covers the audible range up to Nyquist', () => {
    const bins = computeNumberBins(SAMPLE_RATE);
    const nyquist = SAMPLE_RATE / 2;
    const maxFreq = MIN_FREQUENCY * 2 ** (bins / BINS_PER_OCTAVE);

    // Max frequency should not exceed Nyquist
    expect(maxFreq).toBeLessThanOrEqual(nyquist);

    // Adding one more bin would exceed Nyquist
    const nextFreq = MIN_FREQUENCY * 2 ** ((bins + 1) / BINS_PER_OCTAVE);
    expect(nextFreq).toBeGreaterThan(nyquist);
  });

  it('returns more bins for higher sample rates', () => {
    expect(computeNumberBins(48000)).toBeGreaterThan(
      computeNumberBins(SAMPLE_RATE),
    );
  });

  it('returns fewer bins for lower sample rates', () => {
    expect(computeNumberBins(22050)).toBeLessThan(
      computeNumberBins(SAMPLE_RATE),
    );
  });
});

describe('computeKernel', () => {
  it('produces the correct number of bins', () => {
    const kernel = computeKernel(SAMPLE_RATE);
    const expectedBins = computeNumberBins(SAMPLE_RATE);

    expect(kernel.numberBins).toBe(expectedBins);
    expect(kernel.bins).toHaveLength(expectedBins);
  });

  it('computes hop size from sample rate', () => {
    const kernel = computeKernel(SAMPLE_RATE);
    const expectedHop = Math.round(HOP_SECONDS * SAMPLE_RATE);

    expect(kernel.hopSize).toBe(expectedHop);
  });

  it('produces longer kernels for lower frequencies', () => {
    const kernel = computeKernel(SAMPLE_RATE);
    const lowBin = kernel.bins[0];
    const highBin = kernel.bins[kernel.numberBins - 1];

    expect(lowBin.length).toBeGreaterThan(highBin.length);
  });

  it('kernel length matches Q-factor formula', () => {
    const kernel = computeKernel(SAMPLE_RATE);

    for (let k = 0; k < kernel.numberBins; k++) {
      const freq = MIN_FREQUENCY * 2 ** (k / BINS_PER_OCTAVE);
      const expectedLength = Math.ceil((Q_FACTOR * SAMPLE_RATE) / freq);
      expect(kernel.bins[k].length).toBe(expectedLength);
      expect(kernel.bins[k].cosValues).toHaveLength(expectedLength);
      expect(kernel.bins[k].sinValues).toHaveLength(expectedLength);
    }
  });
});

describe('magnitudeToByte', () => {
  it('returns 0 for zero magnitude', () => {
    expect(magnitudeToByte(0)).toBe(0);
  });

  it('returns 0 for negative magnitude', () => {
    expect(magnitudeToByte(-1)).toBe(0);
  });

  it('returns 0 for magnitude at MIN_DECIBELS', () => {
    const mag = 10 ** (MIN_DECIBELS / 20);
    expect(magnitudeToByte(mag)).toBe(0);
  });

  it('returns 255 for magnitude at MAX_DECIBELS', () => {
    const mag = 10 ** (MAX_DECIBELS / 20);
    expect(magnitudeToByte(mag)).toBe(255);
  });

  it('returns 255 for magnitude above MAX_DECIBELS', () => {
    expect(magnitudeToByte(1.0)).toBe(255);
  });

  it('returns intermediate values for intermediate magnitudes', () => {
    const midDb = (MIN_DECIBELS + MAX_DECIBELS) / 2;
    const mag = 10 ** (midDb / 20);
    const result = magnitudeToByte(mag);

    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(255);
    // Should be approximately 128 (midpoint)
    expect(Math.abs(result - 128)).toBeLessThan(2);
  });
});

describe('mixToMono', () => {
  it('returns the single channel unchanged for mono input', () => {
    const channel = new Float32Array([0.1, 0.2, 0.3]);
    const result = mixToMono([channel], 3);

    expect(result).toBe(channel);
  });

  it('averages two channels for stereo input', () => {
    const left = new Float32Array([1.0, 0.0, 0.5]);
    const right = new Float32Array([0.0, 1.0, 0.5]);
    const result = mixToMono([left, right], 3);

    expect(result[0]).toBeCloseTo(0.5);
    expect(result[1]).toBeCloseTo(0.5);
    expect(result[2]).toBeCloseTo(0.5);
  });

  it('averages three channels correctly', () => {
    const ch1 = new Float32Array([0.3, 0.6]);
    const ch2 = new Float32Array([0.6, 0.3]);
    const ch3 = new Float32Array([0.0, 0.0]);
    const result = mixToMono([ch1, ch2, ch3], 2);

    expect(result[0]).toBeCloseTo(0.3);
    expect(result[1]).toBeCloseTo(0.3);
  });
});

describe('analyseCQT', () => {
  it('returns SpectrogramData with correct metadata', () => {
    const duration = 0.1;
    const length = Math.ceil(duration * SAMPLE_RATE);
    const channelData = [new Float32Array(length)];

    const result = analyseCQT(channelData, SAMPLE_RATE, length);

    expect(result.sampleRate).toBe(SAMPLE_RATE);
    expect(result.duration).toBeCloseTo(duration, 3);
    expect(result.timeResolution).toBe(HOP_SECONDS);
    expect(result.frequencyBinCount).toBe(computeNumberBins(SAMPLE_RATE));
  });

  it('produces the expected number of frames', () => {
    const duration = 0.1;
    const length = Math.ceil(duration * SAMPLE_RATE);
    const channelData = [new Float32Array(length)];

    const result = analyseCQT(channelData, SAMPLE_RATE, length);
    const expectedFrames = Math.floor(duration / HOP_SECONDS);

    expect(result.frequencyFrames).toHaveLength(expectedFrames);
  });

  it('frames are independent Uint8Array copies', () => {
    const duration = 0.1;
    const length = Math.ceil(duration * SAMPLE_RATE);
    const channelData = [new Float32Array(length)];

    const result = analyseCQT(channelData, SAMPLE_RATE, length);

    for (const frame of result.frequencyFrames) {
      expect(frame).toBeInstanceOf(Uint8Array);
      expect(frame.length).toBe(result.frequencyBinCount);
    }

    if (result.frequencyFrames.length >= 2) {
      expect(result.frequencyFrames[0]).not.toBe(result.frequencyFrames[1]);
    }
  });

  it('produces all-zero frames for silence', () => {
    const duration = 0.1;
    const length = Math.ceil(duration * SAMPLE_RATE);
    const channelData = [new Float32Array(length)];

    const result = analyseCQT(channelData, SAMPLE_RATE, length);

    for (const frame of result.frequencyFrames) {
      expect(frame.every((v) => v === 0)).toBe(true);
    }
  });

  it('detects a 440 Hz sine at the correct CQ bin', () => {
    const duration = 0.5;
    const length = Math.ceil(duration * SAMPLE_RATE);
    const signal = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      signal[i] = Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
    }

    const result = analyseCQT([signal], SAMPLE_RATE, length);

    // Expected bin for 440 Hz: k = BINS_PER_OCTAVE * log2(440 / MIN_FREQUENCY)
    const expectedBin = Math.round(
      BINS_PER_OCTAVE * Math.log2(440 / MIN_FREQUENCY),
    );

    // Pick a frame from the middle (avoid edge effects)
    const midFrame =
      result.frequencyFrames[Math.floor(result.frequencyFrames.length / 2)];

    // Find the peak bin
    let peakBin = 0;
    for (let i = 1; i < midFrame.length; i++) {
      if (midFrame[i] > midFrame[peakBin]) peakBin = i;
    }

    // Peak should be within ±1 bin of expected
    expect(Math.abs(peakBin - expectedBin)).toBeLessThanOrEqual(1);
  });

  it('detects a 200 Hz sine at the correct CQ bin', () => {
    const duration = 0.5;
    const length = Math.ceil(duration * SAMPLE_RATE);
    const signal = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      signal[i] = Math.sin((2 * Math.PI * 200 * i) / SAMPLE_RATE);
    }

    const result = analyseCQT([signal], SAMPLE_RATE, length);

    const expectedBin = Math.round(
      BINS_PER_OCTAVE * Math.log2(200 / MIN_FREQUENCY),
    );

    const midFrame =
      result.frequencyFrames[Math.floor(result.frequencyFrames.length / 2)];

    let peakBin = 0;
    for (let i = 1; i < midFrame.length; i++) {
      if (midFrame[i] > midFrame[peakBin]) peakBin = i;
    }

    expect(Math.abs(peakBin - expectedBin)).toBeLessThanOrEqual(1);
  });

  it('handles multi-channel audio by mixing to mono', () => {
    const duration = 0.1;
    const length = Math.ceil(duration * SAMPLE_RATE);
    const left = new Float32Array(length);
    const right = new Float32Array(length);

    // 440 Hz in left channel only
    for (let i = 0; i < length; i++) {
      left[i] = Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
    }

    const result = analyseCQT([left, right], SAMPLE_RATE, length);

    // Should still detect 440 Hz (at half amplitude after mono mix)
    const midFrame =
      result.frequencyFrames[Math.floor(result.frequencyFrames.length / 2)];
    const hasNonZero = midFrame.some((v) => v > 0);
    expect(hasNonZero).toBe(true);
  });
});

describe('analyseCQTFromAudioBuffer', () => {
  it('delegates to analyseCQT with extracted channel data', () => {
    const length = 4410;
    const channelData = new Float32Array(length);
    const audioBuffer = {
      numberOfChannels: 1,
      length,
      sampleRate: SAMPLE_RATE,
      duration: length / SAMPLE_RATE,
      getChannelData: vi.fn().mockReturnValue(channelData),
    } as unknown as AudioBuffer;

    const result = analyseCQTFromAudioBuffer(audioBuffer);

    expect(audioBuffer.getChannelData).toHaveBeenCalledWith(0);
    expect(result.sampleRate).toBe(SAMPLE_RATE);
    expect(result.frequencyBinCount).toBe(computeNumberBins(SAMPLE_RATE));
  });
});
