import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock essentiaLoader before importing the module under test (same idiom as
// MelodyExtractor.test.ts's @spotify/basic-pitch mock).
// ---------------------------------------------------------------------------

const mockArrayToVector = vi.fn();
const mockRhythmExtractor2013 = vi.fn();
const mockOnsetRate = vi.fn();
const mockVectorToArray = vi.fn();

vi.mock('../../classification/essentiaLoader', () => ({
  getEssentia: vi.fn().mockResolvedValue({
    arrayToVector: (...args: unknown[]) => mockArrayToVector(...args),
    RhythmExtractor2013: (...args: unknown[]) =>
      mockRhythmExtractor2013(...args),
    OnsetRate: (...args: unknown[]) => mockOnsetRate(...args),
    vectorToArray: (...args: unknown[]) => mockVectorToArray(...args),
  }),
}));

import { analyseRhythm } from '../RhythmAnalyser';

// A fake essentia VectorFloat handle — a real one is an embind-wrapped
// WASM-heap object with a `.delete()` method (not a plain array), which is
// why `vectorToArray` exists at all.
function mockVector() {
  return { delete: vi.fn() };
}

describe('analyseRhythm', () => {
  it('maps essentia RhythmExtractor2013/OnsetRate output to RhythmData', async () => {
    const signalVector = mockVector();
    const ticksVector = mockVector();
    const estimatesVector = mockVector();
    const bpmIntervalsVector = mockVector();
    const onsetsVector = mockVector();

    mockArrayToVector.mockReturnValue(signalVector);
    mockRhythmExtractor2013.mockReturnValue({
      bpm: 120.5,
      confidence: 3.2,
      ticks: ticksVector,
      estimates: estimatesVector,
      bpmIntervals: bpmIntervalsVector,
    });
    mockOnsetRate.mockReturnValue({ onsets: onsetsVector, onsetRate: 2 });
    mockVectorToArray.mockImplementation((vector: unknown) => {
      if (vector === ticksVector) return new Float32Array([0.5, 1.0]);
      if (vector === onsetsVector) return new Float32Array([0.25, 0.5, 1.0]);
      return new Float32Array([]);
    });

    const mono = new Float32Array(44100);
    const result = await analyseRhythm(mono, 44100);

    expect(result).toEqual({
      bpm: 120.5,
      confidence: 3.2,
      ticks: [0.5, 1.0],
      onsets: [0.25, 0.5, 1.0],
    });
    expect(mockRhythmExtractor2013).toHaveBeenCalledWith(
      signalVector,
      208,
      'multifeature',
      40,
    );
  });

  it('deletes every essentia VectorFloat handle after use, even ones not in the returned data', async () => {
    const signalVector = mockVector();
    const ticksVector = mockVector();
    const estimatesVector = mockVector();
    const bpmIntervalsVector = mockVector();
    const onsetsVector = mockVector();

    mockArrayToVector.mockReturnValue(signalVector);
    mockRhythmExtractor2013.mockReturnValue({
      bpm: 120,
      confidence: 3,
      ticks: ticksVector,
      estimates: estimatesVector,
      bpmIntervals: bpmIntervalsVector,
    });
    mockOnsetRate.mockReturnValue({ onsets: onsetsVector, onsetRate: 1 });
    mockVectorToArray.mockReturnValue(new Float32Array([]));

    await analyseRhythm(new Float32Array(44100), 44100);

    // estimates/bpmIntervals never appear in RhythmData — they must still be
    // deleted, not just the ones read into the output.
    expect(signalVector.delete).toHaveBeenCalledOnce();
    expect(ticksVector.delete).toHaveBeenCalledOnce();
    expect(estimatesVector.delete).toHaveBeenCalledOnce();
    expect(bpmIntervalsVector.delete).toHaveBeenCalledOnce();
    expect(onsetsVector.delete).toHaveBeenCalledOnce();
  });
});
