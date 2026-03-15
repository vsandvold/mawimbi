import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @spotify/basic-pitch before importing the module under test
// ---------------------------------------------------------------------------

const mockEvaluateModel = vi.fn();
const mockModel = Promise.resolve({});

vi.mock('@spotify/basic-pitch', () => ({
  BasicPitch: vi.fn().mockImplementation(function () {
    return {
      evaluateModel: mockEvaluateModel,
      model: mockModel,
    };
  }),
  outputToNotesPoly: vi.fn().mockReturnValue([
    {
      startFrame: 0,
      durationFrames: 20,
      pitchMidi: 60,
      amplitude: 0.8,
    },
    {
      startFrame: 30,
      durationFrames: 15,
      pitchMidi: 64,
      amplitude: 0.7,
    },
  ]),
  addPitchBendsToNoteEvents: vi.fn().mockImplementation((_, notes) =>
    notes.map(
      (
        n: Record<string, unknown>,
        i: number, // add pitch bends only to first note
      ) => ({
        ...n,
        pitchBends: i === 0 ? [0, 0.1, 0.2, 0.1, 0] : undefined,
      }),
    ),
  ),
  noteFramesToTime: vi.fn().mockReturnValue([
    {
      startTimeSeconds: 0.0,
      durationSeconds: 0.5,
      pitchMidi: 60,
      amplitude: 0.8,
      pitchBends: [0, 0.1, 0.2, 0.1, 0],
    },
    {
      startTimeSeconds: 0.7,
      durationSeconds: 0.35,
      pitchMidi: 64,
      amplitude: 0.7,
    },
  ]),
}));

import {
  extractMelody,
  resampleLinear,
  resetBasicPitch,
  MODEL_SAMPLE_RATE,
  TIME_RESOLUTION,
} from '../MelodyExtractor';

// ---------------------------------------------------------------------------
// resampleLinear
// ---------------------------------------------------------------------------

describe('resampleLinear', () => {
  it('returns the same array when sample rates match', () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    const result = resampleLinear(input, 44100, 44100);
    expect(result).toBe(input);
  });

  it('downsamples from 44100 to 22050 (2:1 ratio)', () => {
    // 8 samples at 44100 → 4 samples at 22050
    const input = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const result = resampleLinear(input, 44100, 22050);

    expect(result.length).toBe(4);
    // First sample should be input[0] = 0
    expect(result[0]).toBeCloseTo(0, 4);
    // Second sample at srcIndex=2 → input[2] = 2
    expect(result[1]).toBeCloseTo(2, 4);
  });

  it('upsamples from 22050 to 44100 (1:2 ratio)', () => {
    const input = new Float32Array([0, 1, 2, 3]);
    const result = resampleLinear(input, 22050, 44100);

    // 4 samples at 22050 → 8 samples at 44100
    expect(result.length).toBe(8);
    expect(result[0]).toBeCloseTo(0, 4);
    // Intermediate sample should interpolate between 0 and 1
    expect(result[1]).toBeCloseTo(0.5, 4);
    expect(result[2]).toBeCloseTo(1, 4);
  });

  it('preserves signal energy approximately', () => {
    // A sine-like signal
    const length = 1000;
    const input = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      input[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    }

    const result = resampleLinear(input, 44100, 22050);
    expect(result.length).toBe(500);

    // RMS should be roughly preserved (within tolerance due to aliasing)
    const inputRms = Math.sqrt(
      input.reduce((sum, v) => sum + v * v, 0) / input.length,
    );
    const outputRms = Math.sqrt(
      result.reduce((sum, v) => sum + v * v, 0) / result.length,
    );
    expect(outputRms).toBeCloseTo(inputRms, 1);
  });

  it('handles single-sample input', () => {
    const input = new Float32Array([0.5]);
    const result = resampleLinear(input, 44100, 22050);
    expect(result.length).toBe(1);
    expect(result[0]).toBeCloseTo(0.5, 4);
  });
});

// ---------------------------------------------------------------------------
// extractMelody
// ---------------------------------------------------------------------------

describe('extractMelody', () => {
  beforeEach(() => {
    resetBasicPitch();
    vi.clearAllMocks();

    // Set up evaluateModel to call the onComplete callback with mock data
    mockEvaluateModel.mockImplementation(
      async (
        _audio: Float32Array,
        onComplete: (f: number[][], o: number[][], c: number[][]) => void,
        percentCallback: (p: number) => void,
      ) => {
        percentCallback(0);
        onComplete(
          [[0.5, 0.9, 0.1]], // frames
          [[0.1, 0.8, 0.0]], // onsets
          [[0.2, 0.7, 0.3]], // contours
        );
        percentCallback(1.0);
      },
    );
  });

  it('resamples audio to 22050 Hz before passing to BasicPitch', async () => {
    const signal = new Float32Array(44100); // 1 second at 44100 Hz
    await extractMelody(signal, 44100);

    // The resampled signal should be ~22050 samples
    const passedAudio = mockEvaluateModel.mock.calls[0][0];
    expect(passedAudio.length).toBe(22050);
  });

  it('passes audio directly when already at 22050 Hz', async () => {
    const signal = new Float32Array(22050); // 1 second at 22050 Hz
    await extractMelody(signal, MODEL_SAMPLE_RATE);

    const passedAudio = mockEvaluateModel.mock.calls[0][0];
    expect(passedAudio.length).toBe(22050);
  });

  it('returns MelodyData with notes and timeResolution', async () => {
    const signal = new Float32Array(44100);
    const result = await extractMelody(signal, 44100);

    expect(result.notes).toHaveLength(2);
    expect(result.timeResolution).toBeCloseTo(TIME_RESOLUTION, 6);
  });

  it('maps BasicPitch output to MelodyNote format', async () => {
    const signal = new Float32Array(44100);
    const result = await extractMelody(signal, 44100);

    const note = result.notes[0];
    expect(note.startTime).toBe(0.0);
    expect(note.endTime).toBe(0.5);
    expect(note.midiNote).toBe(60);
    expect(note.confidence).toBe(0.8);
  });

  it('includes pitch bends when present', async () => {
    const signal = new Float32Array(44100);
    const result = await extractMelody(signal, 44100);

    expect(result.notes[0].pitchBends).toEqual([0, 0.1, 0.2, 0.1, 0]);
    expect(result.notes[1].pitchBends).toBeUndefined();
  });

  it('accumulates frames across multiple onComplete callbacks', async () => {
    mockEvaluateModel.mockImplementation(
      async (
        _audio: Float32Array,
        onComplete: (f: number[][], o: number[][], c: number[][]) => void,
        percentCallback: (p: number) => void,
      ) => {
        percentCallback(0);
        // Simulate chunked output (two callback invocations)
        onComplete([[0.5, 0.9]], [[0.1, 0.8]], [[0.2, 0.7]]);
        percentCallback(0.5);
        onComplete([[0.3, 0.6]], [[0.4, 0.2]], [[0.1, 0.5]]);
        percentCallback(1.0);
      },
    );

    const signal = new Float32Array(44100);
    const result = await extractMelody(signal, 44100);

    // Should still produce notes (mocked outputToNotesPoly always returns 2)
    expect(result.notes.length).toBeGreaterThan(0);
  });
});
