import { describe, expect, it } from 'vitest';
import {
  MIN_TEMPO_CONFIDENCE,
  formatBpm,
  isConfidentTempo,
  selectConfidentTempo,
} from '../tempo';

describe('isConfidentTempo', () => {
  it('accepts an estimate at or above the threshold', () => {
    expect(isConfidentTempo({ bpm: 120, confidence: 3.7 })).toBe(true);
    expect(
      isConfidentTempo({ bpm: 120, confidence: MIN_TEMPO_CONFIDENCE }),
    ).toBe(true);
  });

  it('rejects an estimate below the threshold', () => {
    expect(
      isConfidentTempo({ bpm: 93, confidence: MIN_TEMPO_CONFIDENCE - 0.01 }),
    ).toBe(false);
    expect(isConfidentTempo({ bpm: 90, confidence: 0 })).toBe(false);
  });

  it('treats an absent estimate as not confident', () => {
    // Analysis still running, or it failed — either way there is no tempo,
    // which is a first-class state rather than an error (spec 007 Goal 4).
    expect(isConfidentTempo(undefined)).toBe(false);
  });

  it('rejects a non-finite or non-positive BPM however confident', () => {
    expect(isConfidentTempo({ bpm: NaN, confidence: 5 })).toBe(false);
    expect(isConfidentTempo({ bpm: 0, confidence: 5 })).toBe(false);
  });
});

describe('selectConfidentTempo', () => {
  it('returns the estimate when it is confident', () => {
    const tempo = { bpm: 120, confidence: 3.7 };
    expect(selectConfidentTempo(tempo)).toBe(tempo);
  });

  it('returns null rather than a low-confidence estimate', () => {
    expect(selectConfidentTempo({ bpm: 93, confidence: 0.9 })).toBeNull();
    expect(selectConfidentTempo(undefined)).toBeNull();
  });
});

describe('formatBpm', () => {
  it('rounds to whole beats per minute', () => {
    expect(formatBpm(119.84)).toBe('120 BPM');
    expect(formatBpm(90)).toBe('90 BPM');
  });
});
