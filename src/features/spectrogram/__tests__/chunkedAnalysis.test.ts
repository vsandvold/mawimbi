// Progressive analysis (mawimbi#539, spec 006 milestone 2, Decision 4):
// chunked emission must never change what gets analysed, only when it's
// delivered. These tests prove that byte-identity holds across real chunk
// boundaries — not merely assumed from `analyseCQTChunked` and `analyseCQT`
// sharing one implementation — and re-run the existing CQ-bin-accuracy
// guard (pattern #220, kb/domain.md) through the chunked entry point.
import {
  analyseCQT,
  analyseCQTChunked,
  BINS_PER_OCTAVE,
  HOP_SECONDS,
  MIN_FREQUENCY,
} from '../CQTAnalyser';

const SAMPLE_RATE = 44100;
// Shared by both 12-TET guard tests below — the tone duration used to build
// each synthetic signal and the mid-frame index picked from it must stay in
// lock-step, so both derive from this one constant (review fix, mawimbi#539:
// they were previously two independent `0.5` literals).
const TARGET_TONE_SECONDS = 0.5;

function makeToneSignal(
  durationSeconds: number,
  frequencyHz: number,
): Float32Array {
  const length = Math.ceil(durationSeconds * SAMPLE_RATE);
  const signal = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    signal[i] = Math.sin((2 * Math.PI * frequencyHz * i) / SAMPLE_RATE);
  }
  return signal;
}

function peakBinOf(frame: Uint8Array): number {
  let peakBin = 0;
  for (let i = 1; i < frame.length; i++) {
    if (frame[i] > frame[peakBin]) peakBin = i;
  }
  return peakBin;
}

describe('analyseCQTChunked', () => {
  it('delivers frames byte-identical to the single-pass analyseCQT, across at least 3 chunk boundaries', () => {
    const CHUNK_FRAMES = 5;
    const signal = makeToneSignal(1.0, 440); // 40 frames at 25ms hop

    const singlePass = analyseCQT([signal], SAMPLE_RATE, signal.length);

    const chunkedFrames: Uint8Array[] = [];
    const chunkStarts: number[] = [];
    const chunked = analyseCQTChunked(
      [signal],
      SAMPLE_RATE,
      signal.length,
      CHUNK_FRAMES,
      (frames, startFrame) => {
        chunkStarts.push(startFrame);
        chunkedFrames.push(...frames);
      },
    );

    // Sanity: this run actually spans well more than 3 chunk boundaries.
    expect(chunkStarts.length).toBeGreaterThanOrEqual(4);

    expect(chunked.frequencyFrames.length).toBe(
      singlePass.frequencyFrames.length,
    );
    expect(chunkedFrames.length).toBe(singlePass.frequencyFrames.length);

    for (let f = 0; f < singlePass.frequencyFrames.length; f++) {
      expect(chunkedFrames[f]).toEqual(singlePass.frequencyFrames[f]);
      expect(chunked.frequencyFrames[f]).toEqual(singlePass.frequencyFrames[f]);
    }

    expect(chunked.frequencyBinCount).toBe(singlePass.frequencyBinCount);
    expect(chunked.timeResolution).toBe(singlePass.timeResolution);
    expect(chunked.sampleRate).toBe(singlePass.sampleRate);
    expect(chunked.duration).toBe(singlePass.duration);
  });

  it('delivers byte-identical frames for silence too, across chunk boundaries', () => {
    const CHUNK_FRAMES = 7;
    const signal = new Float32Array(Math.ceil(0.5 * SAMPLE_RATE)); // silence

    const singlePass = analyseCQT([signal], SAMPLE_RATE, signal.length);
    const chunkedFrames: Uint8Array[] = [];
    analyseCQTChunked(
      [signal],
      SAMPLE_RATE,
      signal.length,
      CHUNK_FRAMES,
      (frames) => chunkedFrames.push(...frames),
    );

    expect(chunkedFrames).toEqual(singlePass.frequencyFrames);
  });

  it('delivers sequential, non-overlapping startFrame offsets with a shorter final chunk', () => {
    const CHUNK_FRAMES = 6;
    const signal = makeToneSignal(1.0, 440); // 40 frames

    const chunkLengths: number[] = [];
    const chunkStarts: number[] = [];
    analyseCQTChunked(
      [signal],
      SAMPLE_RATE,
      signal.length,
      CHUNK_FRAMES,
      (frames, startFrame) => {
        chunkStarts.push(startFrame);
        chunkLengths.push(frames.length);
      },
    );

    // 40 frames / 6 per chunk = 6 full chunks + one 4-frame remainder.
    expect(chunkStarts).toEqual([0, 6, 12, 18, 24, 30, 36]);
    expect(chunkLengths).toEqual([6, 6, 6, 6, 6, 6, 4]);
  });

  it('places a 440 Hz tone within the expected CQ bin on the chunked path (12-TET guard, pattern #220)', () => {
    const CHUNK_FRAMES = 5;
    const signal = makeToneSignal(TARGET_TONE_SECONDS, 440); // 20 frames

    let midFrame: Uint8Array | undefined;
    let frameIndex = 0;
    // Avoid edge effects by picking a frame from the middle.
    const targetFrameIndex = Math.floor(TARGET_TONE_SECONDS / HOP_SECONDS / 2);

    analyseCQTChunked(
      [signal],
      SAMPLE_RATE,
      signal.length,
      CHUNK_FRAMES,
      (frames) => {
        for (const frame of frames) {
          if (frameIndex === targetFrameIndex) midFrame = frame;
          frameIndex++;
        }
      },
    );

    expect(midFrame).toBeDefined();
    const expectedBin = Math.round(
      BINS_PER_OCTAVE * Math.log2(440 / MIN_FREQUENCY),
    );

    expect(Math.abs(peakBinOf(midFrame!) - expectedBin)).toBeLessThanOrEqual(1);
  });

  it('keeps octave spacing uniform on the chunked path (12-TET guard, pattern #220)', () => {
    const CHUNK_FRAMES = 5;
    // Four octaves above 440 Hz — comfortably clear of the kernel-capped
    // low-frequency range (below ~340 Hz, kb/domain.md) so peak detection
    // isn't confounded by its reduced resolution.
    const frequencies = [440, 880, 1760, 3520, 7040];
    const targetFrameIndex = Math.floor(TARGET_TONE_SECONDS / HOP_SECONDS / 2);

    const peakBins = frequencies.map((frequencyHz) => {
      const signal = makeToneSignal(TARGET_TONE_SECONDS, frequencyHz);
      let midFrame: Uint8Array | undefined;
      let frameIndex = 0;
      analyseCQTChunked(
        [signal],
        SAMPLE_RATE,
        signal.length,
        CHUNK_FRAMES,
        (frames) => {
          for (const frame of frames) {
            if (frameIndex === targetFrameIndex) midFrame = frame;
            frameIndex++;
          }
        },
      );
      return peakBinOf(midFrame!);
    });

    const diffs = peakBins.slice(1).map((bin, i) => bin - peakBins[i]);
    const mean = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
    const variance =
      diffs.reduce((sum, d) => sum + (d - mean) ** 2, 0) / diffs.length;
    const coefficientOfVariation = Math.sqrt(variance) / mean;

    expect(coefficientOfVariation).toBeLessThan(0.15);
  });
});
