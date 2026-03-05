/**
 * Logarithmic frequency mapping for FFT visualisation.
 *
 * Linear FFT bins are remapped to perceptually-spaced (log) bins so that
 * equal visual distances correspond to equal musical intervals — matching
 * human pitch perception.
 */

import {
  type MultiBandMergeParams,
  REFERENCE_MIN_FREQUENCY,
} from './dualBandAnalysis';

/**
 * Creates a mapping from output (log-spaced) bins to input (linear) bins.
 *
 * Each entry `mapping[i]` is an array of linear bin indices that feed into
 * output bin `i`. Low-frequency output bins map to a single input bin
 * (expanding the low range); high-frequency output bins pool multiple
 * input bins (compressing the high range).
 *
 * When `binWidth` is provided, the mapping uses actual frequencies and
 * the shared `REFERENCE_MIN_FREQUENCY` anchor, producing output that
 * aligns with `createMultiBandLogMapping` — the same frequency maps to
 * the same output bin position regardless of FFT size. Output bins below
 * the FFT's resolution clamp to the lowest input bin.
 *
 * Without `binWidth`, the mapping spans bin indices 1 to
 * `inputBinCount - 1` on a log scale (legacy behaviour).
 */
export function createLogFrequencyMapping(
  inputBinCount: number,
  outputBinCount: number = inputBinCount,
  binWidth?: number,
): number[][] {
  if (binWidth !== undefined) {
    return createFrequencyAwareMapping(inputBinCount, outputBinCount, binWidth);
  }
  return createBinIndexMapping(inputBinCount, outputBinCount);
}

function createBinIndexMapping(
  inputBinCount: number,
  outputBinCount: number,
): number[][] {
  const logMin = 0; // ln(1) — first non-DC bin
  const logMax = Math.log(inputBinCount - 1);

  const mapping: number[][] = new Array(outputBinCount);

  for (let i = 0; i < outputBinCount; i++) {
    const t = i / (outputBinCount - 1);
    const targetIdx = Math.exp(logMin + t * (logMax - logMin));

    let lo = 0;
    let hi = inputBinCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (mid < targetIdx) lo = mid + 1;
      else hi = mid;
    }
    let closest = lo;
    if (lo > 0 && Math.abs(targetIdx - (lo - 1)) < Math.abs(lo - targetIdx)) {
      closest = lo - 1;
    }

    mapping[i] = [Math.min(closest, inputBinCount - 1)];
  }

  poolConsecutiveBins(mapping);
  return mapping;
}

function createFrequencyAwareMapping(
  inputBinCount: number,
  outputBinCount: number,
  binWidth: number,
): number[][] {
  const minFreq = Math.min(REFERENCE_MIN_FREQUENCY, binWidth);
  const maxFreq = (inputBinCount - 1) * binWidth;
  const logMin = Math.log(minFreq);
  const logMax = Math.log(maxFreq);

  const mapping: number[][] = new Array(outputBinCount);

  for (let i = 0; i < outputBinCount; i++) {
    const t = i / (outputBinCount - 1);
    const targetFreq = Math.exp(logMin + t * (logMax - logMin));

    // Convert target frequency to bin index, clamping to [1, inputBinCount-1]
    const targetBin = targetFreq / binWidth;
    const clampedTarget = Math.max(1, Math.min(targetBin, inputBinCount - 1));

    let lo = 1;
    let hi = inputBinCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (mid < clampedTarget) lo = mid + 1;
      else hi = mid;
    }
    let closest = lo;
    if (
      lo > 1 &&
      Math.abs(clampedTarget - (lo - 1)) < Math.abs(lo - clampedTarget)
    ) {
      closest = lo - 1;
    }

    mapping[i] = [closest];
  }

  poolConsecutiveBins(mapping);
  return mapping;
}

/**
 * Creates a log-frequency mapping for merged multi-band FFT data.
 *
 * Unlike `createLogFrequencyMapping` (which assumes uniform bin width),
 * this function respects the actual frequency of each merged bin. Each
 * band may have a different bin width (due to different sample rates and
 * FFT sizes), so the mapping computes the true frequency for every
 * merged bin and maps on that basis.
 *
 * Uses `REFERENCE_MIN_FREQUENCY` as the lower bound of the log scale,
 * ensuring consistent output positions across all analysis modes.
 *
 * Each entry `mapping[i]` is an array of merged-bin indices that feed into
 * output bin `i`, using the same pooling convention as the uniform version.
 */
export function createMultiBandLogMapping(
  params: MultiBandMergeParams,
  outputBinCount?: number,
): number[][] {
  const { bands, mergedBinCount } = params;
  const outCount = outputBinCount ?? mergedBinCount;

  // Build frequency array for all merged bins
  const freq = new Float64Array(mergedBinCount);
  let offset = 0;
  for (const band of bands) {
    for (let i = 0; i < band.binCount; i++) {
      freq[offset + i] = (band.startBin + i) * band.binWidth;
    }
    offset += band.binCount;
  }

  const naturalMin = freq[1] || REFERENCE_MIN_FREQUENCY;
  const minFreq = Math.min(REFERENCE_MIN_FREQUENCY, naturalMin);
  const maxFreq = freq[mergedBinCount - 1];
  const logMin = Math.log(minFreq);
  const logMax = Math.log(maxFreq);

  const mapping: number[][] = new Array(outCount);

  for (let i = 0; i < outCount; i++) {
    const t = i / (outCount - 1);
    const targetFreq = Math.exp(logMin + t * (logMax - logMin));

    let lo = 0;
    let hi = mergedBinCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (freq[mid] < targetFreq) lo = mid + 1;
      else hi = mid;
    }
    let closest = lo;
    if (
      lo > 0 &&
      Math.abs(targetFreq - freq[lo - 1]) < Math.abs(freq[lo] - targetFreq)
    ) {
      closest = lo - 1;
    }

    mapping[i] = [closest];
  }

  poolConsecutiveBins(mapping);
  return mapping;
}

/**
 * Creates a log-frequency mapping for merged dual-band FFT data.
 *
 * @deprecated Use `createMultiBandLogMapping` instead. This function is
 * retained for backward compatibility.
 */
export function createDualBandLogMapping(
  mergedBinCount: number,
  lowBinCount: number,
  lowBinWidth: number,
  highBinStart: number,
  highBinWidth: number,
  outputBinCount: number = mergedBinCount,
): number[][] {
  const params: MultiBandMergeParams = {
    bands: [
      {
        binWidth: lowBinWidth,
        startBin: 0,
        endBin: lowBinCount,
        binCount: lowBinCount,
        sampleRate: 0,
        fftSize: 0,
        lowerFreq: 0,
        upperFreq: 0,
      },
      {
        binWidth: highBinWidth,
        startBin: highBinStart,
        endBin: highBinStart + (mergedBinCount - lowBinCount),
        binCount: mergedBinCount - lowBinCount,
        sampleRate: 0,
        fftSize: 0,
        lowerFreq: 0,
        upperFreq: 0,
      },
    ],
    mergedBinCount,
  };
  return createMultiBandLogMapping(params, outputBinCount);
}

function poolConsecutiveBins(mapping: number[][]): void {
  for (let i = 0; i < mapping.length - 1; i++) {
    const df = mapping[i + 1][0] - mapping[i][0];
    if (df <= 1) continue;
    for (let j = 1; j <= df; j++) {
      mapping[i].push(mapping[i][0] + j);
    }
  }
}

/**
 * Applies a logarithmic frequency mapping to Float32Array dB data.
 *
 * When multiple input bins map to one output bin the **maximum** value
 * is kept, preserving the strongest frequency component in each band.
 */
export function applyLogFrequencyMapping(
  input: Float32Array | Uint8Array,
  mapping: number[][],
  output: Float32Array | Uint8Array,
): void {
  for (let i = 0; i < mapping.length; i++) {
    const pool = mapping[i];
    let max = input[pool[0]];
    for (let j = 1; j < pool.length; j++) {
      if (input[pool[j]] > max) max = input[pool[j]];
    }
    output[i] = max;
  }
}
