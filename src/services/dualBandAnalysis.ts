/**
 * Multi-band FFT analysis configuration.
 *
 * Replaces the former dual-band split with an N-band design where each
 * band uses a sample rate and FFT size chosen to approximate constant-Q
 * resolution. Adjacent bands differ by ~2–4× in temporal resolution,
 * eliminating the sharp visual discontinuity of the old 2-band system.
 *
 * Single source of truth for band constants, merge-boundary computation,
 * and log-frequency mapping used by both the main-thread OfflineAnalyser
 * and the spectrogram web worker.
 */

import { createMultiBandLogMapping } from './logFrequencyMapping';

// ---------------------------------------------------------------------------
// Band configuration
// ---------------------------------------------------------------------------

export type BandConfig = {
  /** Lower frequency boundary (inclusive). 0 for the first band. */
  lowerFreq: number;
  /** Upper frequency boundary (exclusive). 0 = Nyquist of native rate. */
  upperFreq: number;
  /** OfflineAudioContext sample rate. 0 = use native sample rate. */
  sampleRate: number;
  /** FFT size for this band's analyser. */
  fftSize: number;
};

/**
 * Four bands spanning sub-bass to treble with geometrically spaced
 * boundaries (~2 octaves each). Temporal resolution improves gradually:
 * 400 ms → 100 ms → 50 ms → 23 ms, avoiding the 17× cliff of the
 * former 2-band design.
 *
 * | Band | Range          | SR    | FFT  | Δf     | Δt    |
 * |------|----------------|-------|------|--------|-------|
 * | 0    | 0–320 Hz       | 5120  | 2048 | 2.5 Hz | 400ms |
 * | 1    | 320–1280 Hz    | 5120  | 512  | 10 Hz  | 100ms |
 * | 2    | 1280–5120 Hz   | 20480 | 1024 | 20 Hz  | 50ms  |
 * | 3    | 5120–Nyquist   | native| 1024 | ~43 Hz | 23ms  |
 */
export const BAND_CONFIGS: BandConfig[] = [
  { lowerFreq: 0, upperFreq: 320, sampleRate: 5120, fftSize: 2048 },
  { lowerFreq: 320, upperFreq: 1280, sampleRate: 5120, fftSize: 512 },
  { lowerFreq: 1280, upperFreq: 5120, sampleRate: 20480, fftSize: 1024 },
  { lowerFreq: 5120, upperFreq: 0, sampleRate: 0, fftSize: 1024 },
];

/**
 * Live (real-time) FFT sizes per band. All bands run at the native sample
 * rate; these sizes approximate the offline resolution for each band.
 *
 * | Band | FFT   | Δf (at 44.1 kHz) | Δt     |
 * |------|-------|------------------|--------|
 * | 0    | 16384 | 2.69 Hz          | 371 ms |
 * | 1    | 4096  | 10.77 Hz         | 93 ms  |
 * | 2    | 2048  | 21.53 Hz         | 46 ms  |
 * | 3    | 1024  | 43.07 Hz         | 23 ms  |
 */
export const LIVE_BAND_FFT_SIZES = [16384, 4096, 2048, 1024];

/**
 * Shared minimum frequency anchor for all log-frequency mappings.
 *
 * Both single-band and multi-band mappings use this as the lower bound
 * of the log scale, ensuring the same frequency maps to the same output
 * bin position regardless of analysis mode. Derived from the lowest
 * band's configuration.
 */
export const REFERENCE_MIN_FREQUENCY =
  BAND_CONFIGS[0].sampleRate / BAND_CONFIGS[0].fftSize;

// ---------------------------------------------------------------------------
// Merge parameters
// ---------------------------------------------------------------------------

export type BandMergeInfo = {
  binWidth: number;
  startBin: number;
  endBin: number;
  binCount: number;
  sampleRate: number;
  fftSize: number;
  lowerFreq: number;
  upperFreq: number;
};

export type MultiBandMergeParams = {
  bands: BandMergeInfo[];
  mergedBinCount: number;
};

/**
 * Resolves a band config against the native sample rate and computes the
 * FFT bin boundaries for merging.
 */
function resolveBand(
  config: BandConfig,
  nativeSampleRate: number,
): BandMergeInfo {
  const sampleRate = config.sampleRate || nativeSampleRate;
  const upperFreq = config.upperFreq || sampleRate / 2;
  const binWidth = sampleRate / config.fftSize;
  const startBin =
    config.lowerFreq === 0 ? 0 : Math.ceil(config.lowerFreq / binWidth);
  const maxBin = config.fftSize / 2;
  const endBin = Math.min(Math.ceil(upperFreq / binWidth), maxBin);
  return {
    binWidth,
    startBin,
    endBin,
    binCount: Math.max(0, endBin - startBin),
    sampleRate,
    fftSize: config.fftSize,
    lowerFreq: config.lowerFreq,
    upperFreq,
  };
}

/**
 * Computes the merge boundaries for combining N-band FFT results
 * into a single frequency array.
 */
export function calculateMultiBandMergeParams(
  nativeSampleRate: number,
): MultiBandMergeParams {
  const bands = BAND_CONFIGS.map((config) =>
    resolveBand(config, nativeSampleRate),
  );
  const mergedBinCount = bands.reduce((sum, b) => sum + b.binCount, 0);
  return { bands, mergedBinCount };
}

/**
 * Computes merge parameters for the live (real-time) analysis path.
 *
 * All bands run at the native sample rate with FFT sizes from
 * `LIVE_BAND_FFT_SIZES` that approximate the offline resolution.
 */
export function calculateLiveMergeParams(
  nativeSampleRate: number,
): MultiBandMergeParams {
  const liveConfigs = BAND_CONFIGS.map((config, i) => ({
    ...config,
    sampleRate: nativeSampleRate,
    fftSize: LIVE_BAND_FFT_SIZES[i],
  }));
  const bands = liveConfigs.map((config) =>
    resolveBand(config, nativeSampleRate),
  );
  const mergedBinCount = bands.reduce((sum, b) => sum + b.binCount, 0);
  return { bands, mergedBinCount };
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

/**
 * Creates a multi-band log-frequency mapping for a given sample rate.
 *
 * Convenience wrapper that combines `calculateMultiBandMergeParams` with
 * `createMultiBandLogMapping` so callers don't need to thread the
 * individual parameters.
 */
export function createMergedLogMapping(sampleRate: number): number[][] {
  const params = calculateMultiBandMergeParams(sampleRate);
  return createMultiBandLogMapping(params);
}
