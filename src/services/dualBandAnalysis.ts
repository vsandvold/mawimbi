/**
 * Dual-band FFT analysis configuration.
 *
 * Single source of truth for the constants, merge-boundary computation,
 * and log-frequency mapping used by both the main-thread OfflineAnalyser
 * and the spectrogram web worker.
 */

import { createDualBandLogMapping } from './logFrequencyMapping';

export const LOW_BAND_FFT_SIZE = 2048;
export const HIGH_BAND_FFT_SIZE = 1024;
export const SPLIT_FREQUENCY = 752;
export const LOW_BAND_SAMPLE_RATE = 5120;

export type MergeParams = {
  lowBinWidth: number;
  highBinWidth: number;
  lowBinCount: number;
  highBinStart: number;
  highBinEnd: number;
  mergedBinCount: number;
};

/**
 * Computes the merge boundaries for combining low-band and high-band
 * FFT results into a single frequency array.
 */
export function calculateMergeParams(sampleRate: number): MergeParams {
  const lowBinWidth = LOW_BAND_SAMPLE_RATE / LOW_BAND_FFT_SIZE;
  const highBinWidth = sampleRate / HIGH_BAND_FFT_SIZE;
  const lowBinCount = Math.ceil(SPLIT_FREQUENCY / lowBinWidth);
  const highBinStart = Math.ceil(SPLIT_FREQUENCY / highBinWidth);
  const highBinEnd = HIGH_BAND_FFT_SIZE / 2;
  const mergedBinCount = lowBinCount + (highBinEnd - highBinStart);
  return {
    lowBinWidth,
    highBinWidth,
    lowBinCount,
    highBinStart,
    highBinEnd,
    mergedBinCount,
  };
}

/**
 * Creates a dual-band log-frequency mapping for a given sample rate.
 *
 * Convenience wrapper that combines `calculateMergeParams` with
 * `createDualBandLogMapping` so callers don't need to thread the
 * individual parameters.
 */
export function createMergedLogMapping(sampleRate: number): number[][] {
  const {
    mergedBinCount,
    lowBinCount,
    lowBinWidth,
    highBinStart,
    highBinWidth,
  } = calculateMergeParams(sampleRate);
  return createDualBandLogMapping(
    mergedBinCount,
    lowBinCount,
    lowBinWidth,
    highBinStart,
    highBinWidth,
  );
}
