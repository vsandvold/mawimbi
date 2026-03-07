import { describe, expect, it, vi } from 'vitest';

const mockPitch = new Float32Array(100).fill(440);
const mockConfidence = new Float32Array(100).fill(0.9);

const mockEssentia = vi.hoisted(() => ({
  arrayToVector: vi.fn().mockReturnValue('vector'),
  EqualLoudness: vi.fn().mockReturnValue({ signal: 'filtered' }),
  PredominantPitchMelodia: vi.fn().mockReturnValue({
    pitch: 'pitchVector',
    pitchConfidence: 'confVector',
  }),
  vectorToArray: vi.fn(),
}));

vi.mock('../essentiaLoader', () => ({
  getEssentia: vi.fn().mockResolvedValue(mockEssentia),
}));

import {
  CONFIDENCE_THRESHOLD,
  extractMelody,
  hzToMidi,
  MELODIA_HOP_SIZE,
  pitchContourToNotes,
} from '../MelodyExtractor';

describe('hzToMidi', () => {
  it('converts A4 (440 Hz) to MIDI 69', () => {
    expect(hzToMidi(440)).toBe(69);
  });

  it('converts C4 (261.63 Hz) to MIDI 60', () => {
    expect(hzToMidi(261.63)).toBe(60);
  });

  it('converts A3 (220 Hz) to MIDI 57', () => {
    expect(hzToMidi(220)).toBe(57);
  });

  it('converts C1 (32.7 Hz) to MIDI 24', () => {
    expect(hzToMidi(32.7)).toBe(24);
  });

  it('returns 0 for zero Hz', () => {
    expect(hzToMidi(0)).toBe(0);
  });

  it('returns 0 for negative Hz', () => {
    expect(hzToMidi(-100)).toBe(0);
  });

  it('clamps to 127 for very high frequencies', () => {
    expect(hzToMidi(100000)).toBe(127);
  });

  it('converts E4 (329.63 Hz) to MIDI 64', () => {
    expect(hzToMidi(329.63)).toBe(64);
  });
});

describe('pitchContourToNotes', () => {
  const sampleRate = 44100;
  const hopSize = MELODIA_HOP_SIZE;
  const frameTime = hopSize / sampleRate;

  /**
   * Helper: creates a contour with a steady pitch for N frames.
   * Returns pitch and confidence arrays.
   */
  function steadyContour(
    hz: number,
    confidence: number,
    frames: number,
  ): { pitch: Float32Array; confidence: Float32Array } {
    return {
      pitch: new Float32Array(frames).fill(hz),
      confidence: new Float32Array(frames).fill(confidence),
    };
  }

  it('groups consecutive same-pitch frames into a single note', () => {
    const frames = 100;
    const { pitch, confidence } = steadyContour(440, 0.9, frames);

    const notes = pitchContourToNotes(pitch, confidence, sampleRate, hopSize);

    expect(notes).toHaveLength(1);
    expect(notes[0].midiNote).toBe(69); // A4
    expect(notes[0].startTime).toBeCloseTo(0);
    expect(notes[0].endTime).toBeCloseTo(frames * frameTime, 4);
    expect(notes[0].confidence).toBeCloseTo(0.9, 4);
  });

  it('splits notes when pitch changes', () => {
    const framesPerNote = 50;
    const totalFrames = framesPerNote * 2;
    const pitch = new Float32Array(totalFrames);
    const confidence = new Float32Array(totalFrames).fill(0.8);

    // First half: A4 (440 Hz), second half: E4 (329.63 Hz)
    for (let i = 0; i < framesPerNote; i++) pitch[i] = 440;
    for (let i = framesPerNote; i < totalFrames; i++) pitch[i] = 329.63;

    const notes = pitchContourToNotes(pitch, confidence, sampleRate, hopSize);

    expect(notes).toHaveLength(2);
    expect(notes[0].midiNote).toBe(69); // A4
    expect(notes[1].midiNote).toBe(64); // E4
    expect(notes[0].endTime).toBeCloseTo(notes[1].startTime, 4);
  });

  it('filters unvoiced frames (pitch = 0)', () => {
    const frames = 100;
    const pitch = new Float32Array(frames);
    const confidence = new Float32Array(frames).fill(0.9);

    // First 50 frames: A4, rest: unvoiced
    for (let i = 0; i < 50; i++) pitch[i] = 440;

    const notes = pitchContourToNotes(pitch, confidence, sampleRate, hopSize);

    expect(notes).toHaveLength(1);
    expect(notes[0].midiNote).toBe(69);
    expect(notes[0].endTime).toBeCloseTo(50 * frameTime, 4);
  });

  it('filters low-confidence frames', () => {
    const frames = 100;
    const pitch = new Float32Array(frames).fill(440);
    const confidence = new Float32Array(frames);

    // First 50 frames: high confidence, rest: below threshold
    for (let i = 0; i < 50; i++) confidence[i] = 0.9;
    for (let i = 50; i < frames; i++)
      confidence[i] = CONFIDENCE_THRESHOLD - 0.01;

    const notes = pitchContourToNotes(pitch, confidence, sampleRate, hopSize);

    expect(notes).toHaveLength(1);
    expect(notes[0].endTime).toBeCloseTo(50 * frameTime, 4);
  });

  it('discards notes shorter than minimum duration', () => {
    // At 44100 Hz with hop 128, each frame is ~2.9 ms.
    // MIN_NOTE_DURATION is 50 ms ≈ ~17 frames.
    const shortFrames = 5; // ~14.5 ms — below threshold
    const longFrames = 50; // ~145 ms — above threshold
    const gapFrames = 10;
    const totalFrames = shortFrames + gapFrames + longFrames;

    const pitch = new Float32Array(totalFrames);
    const confidence = new Float32Array(totalFrames);

    // Short note (should be filtered)
    for (let i = 0; i < shortFrames; i++) {
      pitch[i] = 440;
      confidence[i] = 0.9;
    }
    // Gap (unvoiced)
    // Long note (should be kept)
    for (let i = shortFrames + gapFrames; i < totalFrames; i++) {
      pitch[i] = 330;
      confidence[i] = 0.9;
    }

    const notes = pitchContourToNotes(pitch, confidence, sampleRate, hopSize);

    expect(notes).toHaveLength(1);
    expect(notes[0].midiNote).toBe(64); // E4
  });

  it('returns empty array for all-unvoiced input', () => {
    const pitch = new Float32Array(100); // all zeros
    const confidence = new Float32Array(100).fill(0.9);

    const notes = pitchContourToNotes(pitch, confidence, sampleRate, hopSize);

    expect(notes).toHaveLength(0);
  });

  it('averages confidence across grouped frames', () => {
    const frames = 40;
    const pitch = new Float32Array(frames).fill(440);
    const confidence = new Float32Array(frames);

    // Ramp confidence from 0.5 to 0.9
    for (let i = 0; i < frames; i++) {
      confidence[i] = 0.5 + (0.4 * i) / (frames - 1);
    }

    const notes = pitchContourToNotes(pitch, confidence, sampleRate, hopSize);

    expect(notes).toHaveLength(1);
    // Average of a linear ramp from 0.5 to 0.9 is 0.7
    expect(notes[0].confidence).toBeCloseTo(0.7, 1);
  });

  it('handles gap between two notes', () => {
    const frames = 120;
    const pitch = new Float32Array(frames);
    const confidence = new Float32Array(frames);

    // Note 1: frames 0–39 (A4)
    for (let i = 0; i < 40; i++) {
      pitch[i] = 440;
      confidence[i] = 0.8;
    }
    // Gap: frames 40–79 (unvoiced)
    // Note 2: frames 80–119 (C5 = 523.25 Hz)
    for (let i = 80; i < 120; i++) {
      pitch[i] = 523.25;
      confidence[i] = 0.7;
    }

    const notes = pitchContourToNotes(pitch, confidence, sampleRate, hopSize);

    expect(notes).toHaveLength(2);
    expect(notes[0].midiNote).toBe(69); // A4
    expect(notes[1].midiNote).toBe(72); // C5
    expect(notes[1].startTime).toBeCloseTo(80 * frameTime, 4);
  });
});

describe('extractMelody', () => {
  it('calls essentia MELODIA and returns MelodyData', async () => {
    mockEssentia.vectorToArray
      .mockReturnValueOnce(mockPitch)
      .mockReturnValueOnce(mockConfidence);

    const signal = new Float32Array(44100); // 1 second
    const result = await extractMelody(signal, 44100);

    expect(mockEssentia.arrayToVector).toHaveBeenCalledWith(signal);
    expect(mockEssentia.EqualLoudness).toHaveBeenCalledWith('vector', 44100);
    expect(mockEssentia.PredominantPitchMelodia).toHaveBeenCalled();
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.timeResolution).toBeCloseTo(MELODIA_HOP_SIZE / 44100, 6);
  });
});
