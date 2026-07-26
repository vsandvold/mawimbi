import { describe, expect, it, vi } from 'vitest';

import { type Track } from '../../tracks/types';
import { AnchorBeatTimes } from '../anchorBeatTimes';
import { induceBeatGrid } from '../induceBeatGrid';
import { MIN_TEMPO_CONFIDENCE } from '../tempo';

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
const MORE_CONFIDENT = { bpm: 120, confidence: MIN_TEMPO_CONFIDENCE + 2 };

/** Eight beats of a steady 120 BPM pulse. */
const TICKS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];

describe('AnchorBeatTimes', () => {
  it('returns the anchor track’s induced grid, not its raw ticks', () => {
    const resolver = new AnchorBeatTimes();
    const tracks = [makeTrack('a', { tempo: CONFIDENT })];

    const times = resolver.resolve(tracks, () => TICKS);

    expect(times).toEqual(induceBeatGrid(TICKS));
  });

  it('offsets an overdub anchor’s grid by its start time', () => {
    // The #484 class (kb/domain.md): ticks are track-buffer relative, and
    // `BeatPulse` compares them against engine time. Invisible on every
    // uploaded track, since those all start at 0.
    const resolver = new AnchorBeatTimes();
    const tracks = [makeTrack('a', { tempo: CONFIDENT, startTime: 3 })];

    const times = resolver.resolve(tracks, () => TICKS);

    expect(times).toEqual(induceBeatGrid(TICKS).map((time) => time + 3));
  });

  it('is empty without a confident anchor', () => {
    const resolver = new AnchorBeatTimes();
    const tracks = [makeTrack('a')];

    expect(resolver.resolve(tracks, () => TICKS)).toEqual([]);
  });

  it('is empty while the anchor’s analysis has not landed', () => {
    const resolver = new AnchorBeatTimes();
    const tracks = [makeTrack('a', { tempo: CONFIDENT })];

    expect(resolver.resolve(tracks, () => undefined)).toEqual([]);
  });

  it('reuses the same array while nothing changes', () => {
    // Identity, not equality: this runs once per animation frame, on the
    // loop mawimbi#541 exists to keep allocation-free, and the caller may
    // use the identity as a dirty check.
    const resolver = new AnchorBeatTimes();
    const tracks = [makeTrack('a', { tempo: CONFIDENT })];

    const first = resolver.resolve(tracks, () => TICKS);
    const second = resolver.resolve(tracks, () => TICKS);

    expect(second).toBe(first);
  });

  it('re-selects the anchor when the track list changes', () => {
    const resolver = new AnchorBeatTimes();
    const ticksByTrack: Record<string, number[]> = {
      a: TICKS,
      b: TICKS.map((tick) => tick * 2),
    };
    const readTicks = (trackId: string) => ticksByTrack[trackId];

    const before = resolver.resolve(
      [
        makeTrack('a', { tempo: MORE_CONFIDENT }),
        makeTrack('b', { tempo: CONFIDENT }),
      ],
      readTicks,
    );
    // Muting the anchor hands the grid to the next audible track — the
    // grid follows what is actually playing (spec Decision 3).
    const after = resolver.resolve(
      [
        makeTrack('a', { tempo: MORE_CONFIDENT, mute: true }),
        makeTrack('b', { tempo: CONFIDENT }),
      ],
      readTicks,
    );

    expect(before).toEqual(induceBeatGrid(ticksByTrack.a));
    expect(after).toEqual(induceBeatGrid(ticksByTrack.b));
  });

  it('picks up ticks that land after the track list settled', () => {
    // Analysis finishes seconds after the upload, without changing the
    // track array — the case a memo keyed on `tracks` alone would miss
    // forever.
    const resolver = new AnchorBeatTimes();
    const tracks = [makeTrack('a', { tempo: CONFIDENT })];
    let ticks: number[] | undefined = undefined;
    const readTicks = () => ticks;

    expect(resolver.resolve(tracks, readTicks)).toEqual([]);
    ticks = TICKS;

    expect(resolver.resolve(tracks, readTicks)).toEqual(induceBeatGrid(TICKS));
  });

  it('does not re-derive the grid on every frame', () => {
    // `induceBeatGrid` sorts and smooths over every beat in the take —
    // the cost the rung renderer had to shed for the same reason
    // (`/code-review` on PR #585).
    const resolver = new AnchorBeatTimes();
    const tracks = [makeTrack('a', { tempo: CONFIDENT })];
    const readTicks = vi.fn(() => TICKS);

    for (let frame = 0; frame < 60; frame++)
      resolver.resolve(tracks, readTicks);

    expect(readTicks).toHaveBeenCalledTimes(60);
    // Same ticks every time, so exactly one derivation — asserted through
    // the returned identity, since the derivation itself is private.
    const times = resolver.resolve(tracks, readTicks);
    expect(resolver.resolve(tracks, readTicks)).toBe(times);
  });
});
