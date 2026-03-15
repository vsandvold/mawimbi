// Resamples audio from one sample rate to another with anti-aliasing.
// Used by both the classification worker and the main-thread fallback path.
//
// When downsampling, a windowed sinc low-pass filter is applied first to
// attenuate frequencies above the target Nyquist, preventing aliasing
// artifacts from corrupting the mel spectrogram input.

// Sinc low-pass filter half-length in samples (at source rate).
// Higher = sharper cutoff but more computation. 16 is a good trade-off
// for 3x downsampling (48 kHz → 16 kHz).
const FILTER_HALF_LENGTH = 16;

// Kaiser window approximation parameter — controls sidelobe attenuation.
// beta ≈ 5 gives ~-45 dB sidelobes, sufficient for classification input.
const KAISER_BETA = 5;

export function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return samples;

  const isDownsampling = toRate < fromRate;
  const filtered = isDownsampling
    ? applyLowPassFilter(samples, toRate / 2, fromRate)
    : samples;

  return interpolate(filtered, fromRate, toRate);
}

// Zeroth-order modified Bessel function of the first kind, I0(x).
// Used to compute the Kaiser window. Converges quickly for typical beta values.
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const halfX = x / 2;
  for (let k = 1; k <= 20; k++) {
    term *= (halfX / k) * (halfX / k);
    sum += term;
    if (term < 1e-10) break;
  }
  return sum;
}

// Windowed sinc low-pass filter. Cutoff is in Hz, sampleRate is the source rate.
function applyLowPassFilter(
  samples: Float32Array,
  cutoffHz: number,
  sampleRate: number,
): Float32Array {
  const normalizedCutoff = cutoffHz / sampleRate;
  const N = FILTER_HALF_LENGTH;
  const kernelLength = 2 * N + 1;
  const kernel = new Float32Array(kernelLength);

  // Build windowed sinc kernel
  const denominator = besselI0(KAISER_BETA);
  for (let i = 0; i < kernelLength; i++) {
    const n = i - N;
    // Sinc
    const sinc =
      n === 0
        ? 2 * normalizedCutoff
        : Math.sin(2 * Math.PI * normalizedCutoff * n) / (Math.PI * n);
    // Kaiser window
    const windowArg = 1 - (n / N) * (n / N);
    const window =
      besselI0(KAISER_BETA * Math.sqrt(Math.max(0, windowArg))) / denominator;
    kernel[i] = sinc * window;
  }

  // Normalize kernel so passband gain is unity
  let kernelSum = 0;
  for (let i = 0; i < kernelLength; i++) kernelSum += kernel[i];
  for (let i = 0; i < kernelLength; i++) kernel[i] /= kernelSum;

  // Convolve
  const output = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let sum = 0;
    for (let j = 0; j < kernelLength; j++) {
      const srcIdx = i - N + j;
      if (srcIdx >= 0 && srcIdx < samples.length) {
        sum += samples[srcIdx] * kernel[j];
      }
    }
    output[i] = sum;
  }

  return output;
}

function interpolate(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  const ratio = fromRate / toRate;
  const outputLength = Math.round(samples.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const fraction = srcIndex - srcIndexFloor;

    const sample0 = samples[srcIndexFloor] ?? 0;
    const sample1 = samples[srcIndexFloor + 1] ?? 0;
    output[i] = sample0 + fraction * (sample1 - sample0);
  }

  return output;
}
