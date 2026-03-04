import { describe, expect, it } from 'vitest';
import { createHannWindow, fft, magnitudeToBytes } from '../fft';

describe('fft', () => {
  describe('DC signal', () => {
    it('concentrates energy in bin 0', () => {
      const N = 8;
      const real = new Float32Array(N).fill(1);
      const imag = new Float32Array(N);

      fft(real, imag);

      // Bin 0 should equal N (sum of all samples)
      expect(real[0]).toBeCloseTo(N, 5);
      expect(imag[0]).toBeCloseTo(0, 5);

      // All other bins should be ~0
      for (let i = 1; i < N; i++) {
        expect(real[i]).toBeCloseTo(0, 5);
        expect(imag[i]).toBeCloseTo(0, 5);
      }
    });
  });

  describe('single cosine', () => {
    it('produces peaks in the correct bin', () => {
      const N = 256;
      const k = 10; // frequency bin
      const real = new Float32Array(N);
      const imag = new Float32Array(N);

      for (let i = 0; i < N; i++) {
        real[i] = Math.cos((2 * Math.PI * k * i) / N);
      }

      fft(real, imag);

      // A pure cosine at bin k should produce N/2 magnitude at bins k and N-k
      const magK = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
      const magNK = Math.sqrt(
        real[N - k] * real[N - k] + imag[N - k] * imag[N - k],
      );

      expect(magK).toBeCloseTo(N / 2, 1);
      expect(magNK).toBeCloseTo(N / 2, 1);

      // Other bins should be ~0
      for (let i = 1; i < N; i++) {
        if (i === k || i === N - k) continue;
        const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        expect(mag).toBeCloseTo(0, 3);
      }
    });
  });

  describe('single sine', () => {
    it('produces imaginary peaks in the correct bin', () => {
      const N = 64;
      const k = 5;
      const real = new Float32Array(N);
      const imag = new Float32Array(N);

      for (let i = 0; i < N; i++) {
        real[i] = Math.sin((2 * Math.PI * k * i) / N);
      }

      fft(real, imag);

      // sin produces energy in imag parts: -N/2 at bin k, +N/2 at bin N-k
      expect(imag[k]).toBeCloseTo(-N / 2, 1);
      expect(imag[N - k]).toBeCloseTo(N / 2, 1);
    });
  });

  describe('Parseval relation', () => {
    it('preserves total energy between time and frequency domains', () => {
      const N = 512;
      const real = new Float32Array(N);
      const imag = new Float32Array(N);

      // Random signal
      for (let i = 0; i < N; i++) {
        real[i] = Math.sin(i * 0.1) + 0.5 * Math.cos(i * 0.37);
      }

      // Time-domain energy
      let timeEnergy = 0;
      for (let i = 0; i < N; i++) {
        timeEnergy += real[i] * real[i];
      }

      fft(real, imag);

      // Frequency-domain energy
      let freqEnergy = 0;
      for (let i = 0; i < N; i++) {
        freqEnergy += real[i] * real[i] + imag[i] * imag[i];
      }
      freqEnergy /= N;

      expect(freqEnergy).toBeCloseTo(timeEnergy, 3);
    });
  });

  describe('power of 2 sizes', () => {
    it.each([4, 8, 16, 32, 1024, 2048])('handles N=%d', (N) => {
      const real = new Float32Array(N);
      const imag = new Float32Array(N);

      // DC signal for easy verification
      real.fill(1);

      fft(real, imag);

      expect(real[0]).toBeCloseTo(N, 3);
      for (let i = 1; i < N; i++) {
        expect(Math.abs(real[i])).toBeLessThan(1e-3);
      }
    });
  });
});

describe('createHannWindow', () => {
  it('returns the correct length', () => {
    const window = createHannWindow(256);
    expect(window.length).toBe(256);
  });

  it('is zero at the endpoints', () => {
    const window = createHannWindow(128);
    expect(window[0]).toBeCloseTo(0, 5);
    expect(window[127]).toBeCloseTo(0, 5);
  });

  it('peaks at 1.0 in the center', () => {
    const N = 256;
    const window = createHannWindow(N);
    // For even N, the peak is at index (N-1)/2 ≈ 127.5, so indices 127 and 128
    // should both be very close to 1
    const center = (N - 1) / 2;
    const idx = Math.round(center);
    expect(window[idx]).toBeCloseTo(1, 2);
  });

  it('is symmetric', () => {
    const N = 64;
    const window = createHannWindow(N);
    for (let i = 0; i < N / 2; i++) {
      expect(window[i]).toBeCloseTo(window[N - 1 - i], 5);
    }
  });
});

describe('magnitudeToBytes', () => {
  it('maps a DC signal correctly', () => {
    const N = 8;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);

    // Pure DC of amplitude 1: after FFT, bin 0 has magnitude N
    real.fill(1);
    fft(real, imag);

    const output = new Uint8Array(N / 2);
    magnitudeToBytes(real, imag, N, -100, -30, output);

    // Bin 0: magnitude = N = 8, dB = 20*log10(8/8) = 0 dB
    // Scaled: (0 - (-100)) / ((-30) - (-100)) * 255 = 100/70 * 255 ≈ 364 → clamped to 255
    expect(output[0]).toBe(255);

    // Other bins: magnitude ~0 → -Infinity dB → clamped to 0
    for (let i = 1; i < N / 2; i++) {
      expect(output[i]).toBe(0);
    }
  });

  it('maps silence to all zeros', () => {
    const N = 16;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    const output = new Uint8Array(N / 2);

    magnitudeToBytes(real, imag, N, -100, -30, output);

    for (let i = 0; i < N / 2; i++) {
      expect(output[i]).toBe(0);
    }
  });

  it('clamps values within 0-255 range', () => {
    const N = 8;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    real[0] = N * 10; // Very large magnitude → dB > maxDecibels
    const output = new Uint8Array(N / 2);

    magnitudeToBytes(real, imag, N, -100, -30, output);

    expect(output[0]).toBe(255);
  });

  it('scales a mid-range value proportionally', () => {
    const N = 8;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);

    // Set bin 0 so dB lands in the middle of the range
    // Want dB = -65 (midpoint of -100 to -30)
    // dB = 20 * log10(mag / N), so mag = N * 10^(dB/20)
    const targetDb = -65;
    real[0] = N * Math.pow(10, targetDb / 20);

    const output = new Uint8Array(N / 2);
    magnitudeToBytes(real, imag, N, -100, -30, output);

    // Expected: 255 * ((-65) - (-100)) / ((-30) - (-100)) = 255 * 35/70 = 127.5
    // Math.round(127.5) is implementation-defined; accept 127 or 128
    expect(output[0]).toBeGreaterThanOrEqual(127);
    expect(output[0]).toBeLessThanOrEqual(128);
  });
});
