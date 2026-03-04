/**
 * Cooley-Tukey radix-2 decimation-in-time FFT.
 *
 * In-place transform of interleaved real and imaginary arrays.
 * Input length must be a power of 2.
 *
 * Runs inside AudioWorklet scope (no DOM or Node dependencies), so it
 * must be a self-contained pure function with no external imports.
 */

/**
 * Computes the in-place forward FFT of the given real and imaginary arrays.
 *
 * After the call, `real[k]` and `imag[k]` hold the real and imaginary
 * parts of the k-th frequency bin (0 ≤ k < N).
 */
export function fft(real: Float32Array, imag: Float32Array): void {
  const N = real.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;

    if (i < j) {
      const tmpR = real[i];
      real[i] = real[j];
      real[j] = tmpR;

      const tmpI = imag[i];
      imag[i] = imag[j];
      imag[j] = tmpI;
    }
  }

  // Butterfly stages
  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size / 2;
    const angle = (-2 * Math.PI) / size;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);

    for (let i = 0; i < N; i += size) {
      let tReal = 1;
      let tImag = 0;

      for (let j = 0; j < halfSize; j++) {
        const a = i + j;
        const b = a + halfSize;

        const bReal = real[b] * tReal - imag[b] * tImag;
        const bImag = real[b] * tImag + imag[b] * tReal;

        real[b] = real[a] - bReal;
        imag[b] = imag[a] - bImag;
        real[a] += bReal;
        imag[a] += bImag;

        const nextTReal = tReal * wReal - tImag * wImag;
        tImag = tReal * wImag + tImag * wReal;
        tReal = nextTReal;
      }
    }
  }
}

/**
 * Creates a Hann window of the given length.
 *
 * w(n) = 0.5 * (1 - cos(2πn / (N-1)))
 */
export function createHannWindow(length: number): Float32Array {
  const window = new Float32Array(length);
  const factor = (2 * Math.PI) / (length - 1);
  for (let i = 0; i < length; i++) {
    window[i] = 0.5 * (1 - Math.cos(factor * i));
  }
  return window;
}

/**
 * Computes magnitude spectrum in dB from FFT output, mapped to 0–255 bytes.
 *
 * Matches the AnalyserNode byte-frequency-data convention:
 *   dB = 20 * log10(magnitude / fftSize)
 *   byte = 255 * (dB - minDecibels) / (maxDecibels - minDecibels)
 *   clamped to [0, 255]
 *
 * Only the first N/2 bins (positive frequencies) are written.
 */
export function magnitudeToBytes(
  real: Float32Array,
  imag: Float32Array,
  fftSize: number,
  minDecibels: number,
  maxDecibels: number,
  output: Uint8Array,
): void {
  const binCount = fftSize / 2;
  const rangeInv = 255 / (maxDecibels - minDecibels);

  for (let i = 0; i < binCount; i++) {
    const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    const dB = magnitude > 0 ? 20 * Math.log10(magnitude / fftSize) : -Infinity;
    const scaled = (dB - minDecibels) * rangeInv;
    output[i] = Math.max(0, Math.min(255, Math.round(scaled)));
  }
}
