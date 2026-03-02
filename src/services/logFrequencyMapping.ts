/**
 * Logarithmic frequency mapping for FFT visualisation.
 *
 * Linear FFT bins are remapped to perceptually-spaced (log) bins so that
 * equal visual distances correspond to equal musical intervals — matching
 * human pitch perception.
 */

/**
 * Creates a mapping from output (log-spaced) bins to input (linear) bins.
 *
 * Each entry `mapping[i]` is an array of linear bin indices that feed into
 * output bin `i`. Low-frequency output bins map to a single input bin
 * (expanding the low range); high-frequency output bins pool multiple
 * input bins (compressing the high range).
 */
export function createLogFrequencyMapping(
  frequencyBinCount: number,
): number[][] {
  const mapping: number[][] = new Array(frequencyBinCount);
  const lower = 1;
  const upper = frequencyBinCount + 1;
  const b = Math.log(lower / upper) / (lower - upper);
  for (let i = 0; i < frequencyBinCount; i++) {
    const logIdx = Math.trunc(Math.exp(b * i)) - 1;
    mapping[i] = [logIdx];
  }
  for (let i = 0; i < frequencyBinCount - 1; i++) {
    const df = mapping[i + 1][0] - mapping[i][0];
    if (df === 1) {
      continue;
    }
    for (let j = 1; j <= df; j++) {
      mapping[i].push(mapping[i][0] + j);
    }
  }
  return mapping;
}

/**
 * Creates a log-frequency mapping for merged dual-band FFT data.
 *
 * Unlike `createLogFrequencyMapping` (which assumes uniform bin width),
 * this function respects the actual frequency of each merged bin. The low
 * band has much finer frequency resolution than the high band, so a mapping
 * based purely on bin index would incorrectly over-expand the low-frequency
 * region and compress the high-frequency region.
 *
 * Each entry `mapping[i]` is an array of merged-bin indices that feed into
 * output bin `i`, using the same pooling convention as the uniform version.
 */
export function createDualBandLogMapping(
  mergedBinCount: number,
  lowBinCount: number,
  lowBinWidth: number,
  highBinStart: number,
  highBinWidth: number,
): number[][] {
  const freq = new Float64Array(mergedBinCount);
  for (let i = 0; i < lowBinCount; i++) {
    freq[i] = i * lowBinWidth;
  }
  for (let i = lowBinCount; i < mergedBinCount; i++) {
    freq[i] = (highBinStart + (i - lowBinCount)) * highBinWidth;
  }

  const minFreq = freq[1] || lowBinWidth;
  const maxFreq = freq[mergedBinCount - 1];
  const logMin = Math.log(minFreq);
  const logMax = Math.log(maxFreq);

  const mapping: number[][] = new Array(mergedBinCount);

  for (let i = 0; i < mergedBinCount; i++) {
    const t = i / (mergedBinCount - 1);
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

  for (let i = 0; i < mergedBinCount - 1; i++) {
    const df = mapping[i + 1][0] - mapping[i][0];
    if (df <= 1) continue;
    for (let j = 1; j <= df; j++) {
      mapping[i].push(mapping[i][0] + j);
    }
  }

  return mapping;
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
