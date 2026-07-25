import { describe, expect, it } from 'vitest';
import { type Track } from '../../tracks/types';
import { MIN_TEMPO_CONFIDENCE } from '../tempo';
import { selectRhythmAnchor } from '../selectRhythmAnchor';

function makeTrack(trackId: string, overrides: Partial<Track> = {}): Track {
  return {
    trackId,
    color: { r: 0, g: 0, b: 0 },
    fileName: `${trackId}.wav`,
    index: 0,
    ...overrides,
  };
}

const CONFIDENT = { bpm: 120, confidence: MIN_TEMPO_CONFIDENCE + 1 };
const MORE_CONFIDENT = { bpm: 90, confidence: MIN_TEMPO_CONFIDENCE + 2 };
const BELOW_THRESHOLD = { bpm: 120, confidence: MIN_TEMPO_CONFIDENCE - 0.01 };

describe('selectRhythmAnchor', () => {
  it('picks the most confident track', () => {
    const tracks = [
      makeTrack('a', { tempo: CONFIDENT }),
      makeTrack('b', { tempo: MORE_CONFIDENT }),
      makeTrack('c', { tempo: CONFIDENT }),
    ];

    expect(selectRhythmAnchor(tracks)).toBe('b');
  });

  it('breaks ties toward the earlier track', () => {
    const tracks = [
      makeTrack('a', { tempo: CONFIDENT }),
      makeTrack('b', { tempo: { ...CONFIDENT } }),
    ];

    expect(selectRhythmAnchor(tracks)).toBe('a');
  });

  it('ignores muted tracks', () => {
    const tracks = [
      makeTrack('a', { tempo: MORE_CONFIDENT, mute: true }),
      makeTrack('b', { tempo: CONFIDENT }),
    ];

    expect(selectRhythmAnchor(tracks)).toBe('b');
  });

  it('ignores tracks silenced by another track being soloed', () => {
    // The un-soloed track is inaudible even though its own `mute` is
    // false — the grid must follow what is actually playing, which is
    // exactly the case a plain `!track.mute` check would get wrong.
    const tracks = [
      makeTrack('a', { tempo: MORE_CONFIDENT }),
      makeTrack('b', { tempo: CONFIDENT, solo: true }),
    ];

    expect(selectRhythmAnchor(tracks)).toBe('b');
  });

  it('ignores a muted track even while it is soloed', () => {
    const tracks = [
      makeTrack('a', { tempo: MORE_CONFIDENT, solo: true, mute: true }),
      makeTrack('b', { tempo: CONFIDENT, solo: true }),
    ];

    expect(selectRhythmAnchor(tracks)).toBe('b');
  });

  it('has no anchor when every estimate is below the threshold', () => {
    const tracks = [
      makeTrack('a', { tempo: BELOW_THRESHOLD }),
      makeTrack('b', { tempo: BELOW_THRESHOLD }),
    ];

    expect(selectRhythmAnchor(tracks)).toBeNull();
  });

  it('has no anchor before any analysis has landed', () => {
    expect(selectRhythmAnchor([makeTrack('a'), makeTrack('b')])).toBeNull();
    expect(selectRhythmAnchor([])).toBeNull();
  });

  it('has no anchor when every confident track is muted', () => {
    const tracks = [
      makeTrack('a', { tempo: MORE_CONFIDENT, mute: true }),
      makeTrack('b', { tempo: BELOW_THRESHOLD }),
    ];

    expect(selectRhythmAnchor(tracks)).toBeNull();
  });

  it('falls back to the next best track when the anchor is deleted', () => {
    const tracks = [
      makeTrack('a', { tempo: CONFIDENT }),
      makeTrack('b', { tempo: MORE_CONFIDENT }),
    ];
    expect(selectRhythmAnchor(tracks)).toBe('b');

    const afterDelete = tracks.filter((track) => track.trackId !== 'b');

    expect(selectRhythmAnchor(afterDelete)).toBe('a');
  });

  it('rejects a non-finite estimate rather than ranking it', () => {
    // `isConfidentTempo` already guards this, but the anchor is the one
    // consumer whose failure mode is a grid drawn from garbage rather than
    // a badge showing a wrong number — worth pinning here too.
    const tracks = [
      makeTrack('a', { tempo: { bpm: Number.NaN, confidence: 5 } }),
      makeTrack('b', { tempo: CONFIDENT }),
    ];

    expect(selectRhythmAnchor(tracks)).toBe('b');
  });
});
