import { extractLoudestSegment } from '../audioSegment';

const SAMPLE_RATE = 48_000;
const SEGMENT_SAMPLES = 10 * SAMPLE_RATE; // 10 seconds

describe('extractLoudestSegment', () => {
  it('returns the original samples when audio is shorter than segment duration', () => {
    const short = new Float32Array(SAMPLE_RATE * 5); // 5 seconds
    short.fill(0.5);

    const result = extractLoudestSegment(short, SAMPLE_RATE);

    expect(result).toBe(short);
  });

  it('returns the original samples when audio is exactly the segment duration', () => {
    const exact = new Float32Array(SEGMENT_SAMPLES);
    exact.fill(0.5);

    const result = extractLoudestSegment(exact, SAMPLE_RATE);

    expect(result).toBe(exact);
  });

  it('returns a segment of the expected length for longer audio', () => {
    const long = new Float32Array(SAMPLE_RATE * 30); // 30 seconds
    long.fill(0.1);

    const result = extractLoudestSegment(long, SAMPLE_RATE);

    expect(result.length).toBe(SEGMENT_SAMPLES);
  });

  it('selects the segment containing the loudest region', () => {
    // 30 seconds of silence with a loud burst at 15–16 seconds
    const long = new Float32Array(SAMPLE_RATE * 30);
    const burstStart = 15 * SAMPLE_RATE;
    const burstEnd = 16 * SAMPLE_RATE;
    for (let i = burstStart; i < burstEnd; i++) {
      long[i] = 0.9;
    }

    const result = extractLoudestSegment(long, SAMPLE_RATE);

    // The selected segment should contain the loud burst
    // The burst is at 15s, so the segment should start somewhere
    // between 6s and 15s to include the burst in a 10s window
    const resultSum = result.reduce((sum, s) => sum + s * s, 0);
    expect(resultSum).toBeGreaterThan(0);

    // Verify the burst is actually in the extracted segment
    let hasBurst = false;
    for (let i = 0; i < result.length; i++) {
      if (result[i] > 0.5) {
        hasBurst = true;
        break;
      }
    }
    expect(hasBurst).toBe(true);
  });

  it('prefers the beginning when energy is uniform', () => {
    // Uniform audio — all windows have equal energy.
    // The function should return the first window (offset 0).
    const uniform = new Float32Array(SAMPLE_RATE * 20);
    uniform.fill(0.3);

    const result = extractLoudestSegment(uniform, SAMPLE_RATE);

    // Check that it's a subarray starting from offset 0
    // (shares the same underlying buffer with offset 0)
    expect(result.byteOffset).toBe(0);
  });

  it('handles different sample rates', () => {
    const rate = 44_100;
    const segmentLength = Math.round(10 * rate);
    const long = new Float32Array(rate * 20); // 20 seconds at 44.1kHz
    long.fill(0.1);

    const result = extractLoudestSegment(long, rate);

    expect(result.length).toBe(segmentLength);
  });

  it('finds a loud segment at the end of the audio', () => {
    const long = new Float32Array(SAMPLE_RATE * 30);
    // Loud burst in the last 2 seconds
    const burstStart = 28 * SAMPLE_RATE;
    for (let i = burstStart; i < long.length; i++) {
      long[i] = 0.8;
    }

    const result = extractLoudestSegment(long, SAMPLE_RATE);

    // Should contain the loud ending
    let hasBurst = false;
    for (let i = 0; i < result.length; i++) {
      if (result[i] > 0.5) {
        hasBurst = true;
        break;
      }
    }
    expect(hasBurst).toBe(true);
  });

  it('finds a loud segment at the beginning of the audio', () => {
    const long = new Float32Array(SAMPLE_RATE * 30);
    // Loud burst in the first 2 seconds
    for (let i = 0; i < 2 * SAMPLE_RATE; i++) {
      long[i] = 0.8;
    }

    const result = extractLoudestSegment(long, SAMPLE_RATE);

    // The 10s segment starting at 0 should contain the burst
    expect(result[0]).toBeCloseTo(0.8);
  });
});
