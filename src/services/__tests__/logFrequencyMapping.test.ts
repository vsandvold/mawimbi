import { describe, expect, it } from 'vitest';
import {
  applyLogFrequencyMapping,
  createDualBandLogMapping,
  createLogFrequencyMapping,
  createMultiBandLogMapping,
} from '../logFrequencyMapping';
import {
  calculateMultiBandMergeParams,
  REFERENCE_MIN_FREQUENCY,
} from '../dualBandAnalysis';
import { fft, magnitudeToBytes } from '../fft';

/**
 * 12-TET semitone frequencies covering the musically relevant range.
 * Each semitone is a factor of 2^(1/12) apart, so on a true log-frequency
 * scale the output bin positions must be equally spaced.
 */
const SEMITONE_RATIO = Math.pow(2, 1 / 12);
const BASE_FREQUENCY = 27.5; // A0

function generateSemitoneFrequencies(minHz: number, maxHz: number): number[] {
  const frequencies: number[] = [];
  let freq = BASE_FREQUENCY;
  while (freq < minHz) freq *= SEMITONE_RATIO;
  while (freq <= maxHz) {
    frequencies.push(freq);
    freq *= SEMITONE_RATIO;
  }
  return frequencies;
}

/**
 * Generates synthetic FFT byte data with peaks at the given frequencies.
 *
 * Creates a time-domain signal as a sum of cosines, applies the FFT, then
 * converts to the 0–255 byte convention used by AnalyserNode.
 */
function generateFftByteData(
  frequencies: number[],
  fftSize: number,
  sampleRate: number,
): Uint8Array {
  const N = fftSize;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);

  for (let n = 0; n < N; n++) {
    for (const freq of frequencies) {
      real[n] += Math.cos((2 * Math.PI * freq * n) / sampleRate);
    }
  }

  fft(real, imag);

  const output = new Uint8Array(N / 2);
  magnitudeToBytes(real, imag, N, -80, -30, output);
  return output;
}

/**
 * Finds the output bin with the highest value within a neighbourhood.
 */
function findPeakBin(
  data: Uint8Array | Float32Array,
  searchCenter: number,
  searchRadius: number,
): number {
  const start = Math.max(0, Math.floor(searchCenter - searchRadius));
  const end = Math.min(data.length - 1, Math.ceil(searchCenter + searchRadius));
  let peakBin = start;
  for (let i = start + 1; i <= end; i++) {
    if (data[i] > data[peakBin]) peakBin = i;
  }
  return peakBin;
}

/**
 * Measures how evenly spaced a set of positions are by computing the
 * coefficient of variation (stddev / mean) of consecutive spacings.
 * A perfect equal spacing gives CV = 0.
 */
function spacingCoefficientOfVariation(positions: number[]): number {
  if (positions.length < 3) return 0;
  const spacings: number[] = [];
  for (let i = 1; i < positions.length; i++) {
    spacings.push(positions[i] - positions[i - 1]);
  }
  const mean = spacings.reduce((a, b) => a + b, 0) / spacings.length;
  const variance =
    spacings.reduce((sum, s) => sum + (s - mean) ** 2, 0) / spacings.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Builds a reverse map: input bin → first output bin that references it.
 */
function buildReverseMap(mapping: number[][]): Map<number, number> {
  const rev = new Map<number, number>();
  for (let i = 0; i < mapping.length; i++) {
    for (const inputBin of mapping[i]) {
      if (!rev.has(inputBin)) rev.set(inputBin, i);
    }
  }
  return rev;
}

describe('logFrequencyMapping', () => {
  describe('12-TET equal spacing', () => {
    const SAMPLE_RATE = 44100;
    const FFT_SIZE = 2048;
    const INPUT_BIN_COUNT = FFT_SIZE / 2; // 1024
    const OUTPUT_BIN_COUNT = 512;
    const BIN_WIDTH = SAMPLE_RATE / FFT_SIZE; // ~21.53 Hz

    // Semitones in a range where individual FFT bins can resolve them.
    // Start at ~200 Hz (well above bin width) and go to ~8 kHz.
    // Take every 4th semitone (minor thirds) for clean peak separation.
    const semitones = generateSemitoneFrequencies(200, 8000);
    const testFrequencies = semitones.filter((_, i) => i % 4 === 0);

    it('createDualBandLogMapping spaces 12-TET tones equally', () => {
      const mapping = createDualBandLogMapping(
        INPUT_BIN_COUNT,
        INPUT_BIN_COUNT,
        BIN_WIDTH,
        0,
        BIN_WIDTH,
        OUTPUT_BIN_COUNT,
      );

      const fftData = generateFftByteData(
        testFrequencies,
        FFT_SIZE,
        SAMPLE_RATE,
      );

      const output = new Uint8Array(OUTPUT_BIN_COUNT);
      applyLogFrequencyMapping(fftData, mapping, output);

      const peakPositions: number[] = [];
      for (const freq of testFrequencies) {
        const minFreq = Math.min(REFERENCE_MIN_FREQUENCY, BIN_WIDTH);
        const maxFreq = (INPUT_BIN_COUNT - 1) * BIN_WIDTH;
        const t =
          (Math.log(freq) - Math.log(minFreq)) /
          (Math.log(maxFreq) - Math.log(minFreq));
        const expectedBin = t * (OUTPUT_BIN_COUNT - 1);
        const peak = findPeakBin(output, expectedBin, OUTPUT_BIN_COUNT * 0.05);
        if (output[peak] > 0) {
          peakPositions.push(peak);
        }
      }

      expect(peakPositions.length).toBeGreaterThanOrEqual(5);

      const cv = spacingCoefficientOfVariation(peakPositions);
      expect(cv).toBeLessThan(0.15);
    });

    it('createLogFrequencyMapping spaces 12-TET tones equally', () => {
      const mapping = createLogFrequencyMapping(
        INPUT_BIN_COUNT,
        OUTPUT_BIN_COUNT,
      );

      const fftData = generateFftByteData(
        testFrequencies,
        FFT_SIZE,
        SAMPLE_RATE,
      );

      const output = new Uint8Array(OUTPUT_BIN_COUNT);
      applyLogFrequencyMapping(fftData, mapping, output);

      const peakPositions: number[] = [];
      for (const freq of testFrequencies) {
        const minFreq = BIN_WIDTH;
        const maxFreq = (INPUT_BIN_COUNT - 1) * BIN_WIDTH;
        const t =
          (Math.log(freq) - Math.log(minFreq)) /
          (Math.log(maxFreq) - Math.log(minFreq));
        const expectedBin = t * (OUTPUT_BIN_COUNT - 1);
        const peak = findPeakBin(output, expectedBin, OUTPUT_BIN_COUNT * 0.08);
        if (output[peak] > 0) {
          peakPositions.push(peak);
        }
      }

      expect(peakPositions.length).toBeGreaterThanOrEqual(5);

      const cv = spacingCoefficientOfVariation(peakPositions);
      expect(cv).toBeLessThan(0.15);
    });

    it('frequency-aware single-band and dual-band place the same tone at the same output bin', () => {
      const singleMapping = createLogFrequencyMapping(
        INPUT_BIN_COUNT,
        OUTPUT_BIN_COUNT,
        BIN_WIDTH,
      );
      const dualBandMapping = createDualBandLogMapping(
        INPUT_BIN_COUNT,
        INPUT_BIN_COUNT,
        BIN_WIDTH,
        0,
        BIN_WIDTH,
        OUTPUT_BIN_COUNT,
      );

      const rev1 = buildReverseMap(singleMapping);
      const rev2 = buildReverseMap(dualBandMapping);

      // Check that semitone frequencies map to the same output bin in both.
      // Use frequencies across a wide range to catch low-frequency divergence.
      const checkFrequencies = [110, 220, 440, 880, 1760, 3520, 7040];
      for (const freq of checkFrequencies) {
        const inputBin = Math.round(freq / BIN_WIDTH);
        const out1 = rev1.get(inputBin)!;
        const out2 = rev2.get(inputBin)!;
        expect(
          Math.abs(out1 - out2),
          `${freq} Hz (bin ${inputBin}): single=${out1} vs dual-band=${out2}`,
        ).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('basic properties', () => {
    it('createLogFrequencyMapping produces correct output length', () => {
      const mapping = createLogFrequencyMapping(1024, 512);
      expect(mapping.length).toBe(512);
    });

    it('createLogFrequencyMapping entries reference valid input indices', () => {
      const inputBinCount = 1024;
      const mapping = createLogFrequencyMapping(inputBinCount, 512);
      for (const pool of mapping) {
        for (const idx of pool) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(inputBinCount);
        }
      }
    });

    it('createDualBandLogMapping produces correct output length', () => {
      const mapping = createDualBandLogMapping(800, 300, 2.5, 18, 43.07, 512);
      expect(mapping.length).toBe(512);
    });

    it('createLogFrequencyMapping output bins are monotonically non-decreasing', () => {
      const mapping = createLogFrequencyMapping(1024, 512);
      for (let i = 1; i < mapping.length; i++) {
        expect(mapping[i][0]).toBeGreaterThanOrEqual(mapping[i - 1][0]);
      }
    });

    it('createDualBandLogMapping output bins are monotonically non-decreasing', () => {
      const mapping = createDualBandLogMapping(800, 300, 2.5, 18, 43.07, 512);
      for (let i = 1; i < mapping.length; i++) {
        expect(mapping[i][0]).toBeGreaterThanOrEqual(mapping[i - 1][0]);
      }
    });

    it('createMultiBandLogMapping produces correct output length', () => {
      const params = calculateMultiBandMergeParams(44100);
      const mapping = createMultiBandLogMapping(params, 512);
      expect(mapping.length).toBe(512);
    });

    it('createMultiBandLogMapping output bins are monotonically non-decreasing', () => {
      const params = calculateMultiBandMergeParams(44100);
      const mapping = createMultiBandLogMapping(params, 512);
      for (let i = 1; i < mapping.length; i++) {
        expect(mapping[i][0]).toBeGreaterThanOrEqual(mapping[i - 1][0]);
      }
    });
  });

  describe('single-band and multi-band frequency alignment', () => {
    const SAMPLE_RATE = 44100;
    const OUTPUT_BIN_COUNT = 512;

    // Single-band parameters (FrequencyVisualizer without dualBand)
    const SINGLE_FFT_SIZE = 2048;
    const SINGLE_BIN_WIDTH = SAMPLE_RATE / SINGLE_FFT_SIZE;
    const SINGLE_INPUT_BIN_COUNT = SINGLE_FFT_SIZE / 2;

    /**
     * Finds the fractional position (0–1) of a frequency in a mapping,
     * where 0 = lowest output bin and 1 = highest.
     */
    function findFractionalPosition(
      mapping: number[][],
      inputBin: number,
    ): number {
      const outputBin = mapping.findIndex((pool) => pool.includes(inputBin));
      if (outputBin === -1) return -1;
      return outputBin / (mapping.length - 1);
    }

    function createOfflineSpectrogramMapping() {
      const params = calculateMultiBandMergeParams(SAMPLE_RATE);

      return {
        mapping: createMultiBandLogMapping(params),
        params,
      };
    }

    /**
     * Converts a frequency to its merged bin index in the offline
     * spectrogram. Finds the correct band and computes the offset.
     */
    function toMergedBin(
      freq: number,
      params: ReturnType<typeof calculateMultiBandMergeParams>,
    ): number {
      let offset = 0;
      for (const band of params.bands) {
        const binIndex = Math.round(freq / band.binWidth);
        if (binIndex >= band.startBin && binIndex < band.endBin) {
          return offset + (binIndex - band.startBin);
        }
        offset += band.binCount;
      }
      // Fallback: use last band
      const lastBand = params.bands[params.bands.length - 1];
      const binIndex = Math.round(freq / lastBand.binWidth);
      return (
        offset -
        lastBand.binCount +
        Math.min(binIndex - lastBand.startBin, lastBand.binCount - 1)
      );
    }

    it('single-band with binWidth aligns with offline spectrogram for A440', () => {
      const singleMapping = createLogFrequencyMapping(
        SINGLE_INPUT_BIN_COUNT,
        OUTPUT_BIN_COUNT,
        SINGLE_BIN_WIDTH,
      );

      const offline = createOfflineSpectrogramMapping();

      const singleA440Bin = Math.round(440 / SINGLE_BIN_WIDTH);
      const singleFraction = findFractionalPosition(
        singleMapping,
        singleA440Bin,
      );

      const offlineA440Bin = toMergedBin(440, offline.params);
      const offlineFraction = findFractionalPosition(
        offline.mapping,
        offlineA440Bin,
      );

      // Both should place A440 within 5% of each other
      expect(Math.abs(singleFraction - offlineFraction)).toBeLessThan(0.05);
    });

    it('single-band with binWidth aligns with multi-band across octaves', () => {
      const singleMapping = createLogFrequencyMapping(
        SINGLE_INPUT_BIN_COUNT,
        OUTPUT_BIN_COUNT,
        SINGLE_BIN_WIDTH,
      );

      const offline = createOfflineSpectrogramMapping();
      const frequencies = [110, 220, 440, 880, 1760, 3520, 7040];

      for (const freq of frequencies) {
        const singleBin = Math.round(freq / SINGLE_BIN_WIDTH);
        const offlineBin = toMergedBin(freq, offline.params);

        const singlePos = findFractionalPosition(singleMapping, singleBin);
        const offlinePos = findFractionalPosition(offline.mapping, offlineBin);

        expect(
          Math.abs(singlePos - offlinePos),
          `${freq} Hz: single=${singlePos.toFixed(3)} vs offline=${offlinePos.toFixed(3)}`,
        ).toBeLessThan(0.05);
      }
    });
  });
});
