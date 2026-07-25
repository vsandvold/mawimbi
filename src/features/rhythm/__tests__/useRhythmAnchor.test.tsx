/**
 * The hook's job is to keep two differently-timed sources describing the
 * *same* track: the anchor selection (synchronous, out of `tracks`) and its
 * beat ticks (asynchronous, out of the spectrogram cache).
 *
 * The regression pinned below (`/code-review` on PR #585): when the anchor
 * moved, `startTime` updated with the new track while the ticks were still
 * the old one's, so for one render the overlay drew the previous anchor's
 * grid at the new anchor's offset. Only visible with an overdub involved —
 * every uploaded track has `startTime: 0`, the same blind spot as #484.
 */
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Track } from '../../tracks/types';
import { MIN_TEMPO_CONFIDENCE } from '../tempo';
import { useRhythmAnchor, type RhythmAnchor } from '../useRhythmAnchor';

const { mockGetRhythm, mockSubscribeToEntry } = vi.hoisted(() => ({
  mockGetRhythm: vi.fn(),
  mockSubscribeToEntry: vi.fn(),
}));

// A module-level constant, not a factory literal: the real hook returns a
// stable singleton, and a fresh object per call would re-run the hook's
// effect on every render (kb/verification.md, `useSpectrogramCache.test.ts`).
const audioService = {
  spectrogramCache: {
    getRhythm: mockGetRhythm,
    subscribeToEntry: mockSubscribeToEntry,
  },
};

vi.mock('../../audio/useAudioService', () => ({
  useAudioService: () => audioService,
}));

const CONFIDENT = { bpm: 120, confidence: MIN_TEMPO_CONFIDENCE + 1 };
const MORE_CONFIDENT = { bpm: 120, confidence: MIN_TEMPO_CONFIDENCE + 2 };

/** 120 BPM, enough beats for `induceBeatGrid` to have something to smooth. */
const TICKS = Array.from({ length: 16 }, (_, i) => i * 0.5);

function makeTrack(trackId: string, overrides: Partial<Track> = {}): Track {
  return {
    trackId,
    color: { r: 0, g: 0, b: 0 },
    fileName: `${trackId}.wav`,
    index: 0,
    ...overrides,
  };
}

/**
 * Records *every* render's value, not just the last one. `rerender` runs
 * inside `act`, which flushes effects before it returns — so reading only
 * the settled value would step straight over the one torn frame between a
 * synchronous anchor change and its asynchronous ticks catching up, which
 * is exactly the frame this file exists to check.
 */
function renderAnchor(tracks: Track[]) {
  const renders: (RhythmAnchor | null)[] = [];
  const Probe = ({ tracks }: { tracks: Track[] }) => {
    renders.push(useRhythmAnchor(tracks));
    return null;
  };
  const view = render(<Probe tracks={tracks} />);
  return {
    renders,
    get current() {
      return renders[renders.length - 1];
    },
    rerender: (next: Track[]) => view.rerender(<Probe tracks={next} />),
  };
}

describe('useRhythmAnchor', () => {
  beforeEach(() => {
    mockGetRhythm.mockReturnValue(undefined);
    mockSubscribeToEntry.mockReturnValue(() => {});
  });

  it('exposes the selected anchor with its own ticks and offset', () => {
    mockGetRhythm.mockReturnValue({ ticks: TICKS });

    const anchor = renderAnchor([
      makeTrack('a', { tempo: CONFIDENT, startTime: 0 }),
    ]);

    expect(anchor.current?.trackId).toBe('a');
    expect(anchor.current?.startTime).toBe(0);
    expect(anchor.current?.grid.times.length).toBe(TICKS.length);
  });

  it('never pairs one track grid with another track offset', () => {
    // `a` is an ordinary upload; `b` is an overdub 8 s in. Handing the
    // anchor to `b` while still holding `a`'s ticks would draw `a`'s grid
    // 1600 px off at the default zoom.
    const uploaded = makeTrack('a', { tempo: MORE_CONFIDENT, startTime: 0 });
    const overdub = makeTrack('b', { tempo: CONFIDENT, startTime: 8 });

    mockGetRhythm.mockImplementation((trackId: string) =>
      trackId === 'a' ? { ticks: TICKS } : undefined,
    );

    const anchor = renderAnchor([uploaded, overdub]);
    expect(anchor.current?.trackId).toBe('a');
    expect(anchor.current?.grid.times.length).toBeGreaterThan(0);

    // Muting `a` hands the anchor to `b`, whose ticks have not arrived.
    anchor.rerender([{ ...uploaded, mute: true }, overdub]);

    expect(anchor.current?.trackId).toBe('b');
    expect(anchor.current?.startTime).toBe(8);
    for (const render of anchor.renders) {
      if (render?.trackId !== 'b') continue;
      expect(
        render.grid.times,
        "a render offered `b`'s startTime alongside a grid that is not `b`'s",
      ).toEqual([]);
    }
  });

  it('picks up the new anchor grid once its ticks are available', () => {
    const uploaded = makeTrack('a', { tempo: MORE_CONFIDENT, startTime: 0 });
    const overdub = makeTrack('b', { tempo: CONFIDENT, startTime: 8 });
    mockGetRhythm.mockReturnValue({ ticks: TICKS });

    const anchor = renderAnchor([uploaded, overdub]);
    anchor.rerender([{ ...uploaded, mute: true }, overdub]);

    expect(anchor.current?.trackId).toBe('b');
    expect(anchor.current?.startTime).toBe(8);
    expect(anchor.current?.grid.times.length).toBe(TICKS.length);
  });

  it('has no anchor when nothing qualifies', () => {
    const anchor = renderAnchor([makeTrack('a')]);

    expect(anchor.current).toBeNull();
  });

  it('keeps one grid identity across unrelated cache notifications', () => {
    // `subscribeToEntry` fires for every write to the entry — melody
    // landing, tiles refreshing — and the overlay's dirty check is by
    // reference, so an unchanged grid must stay the same object or every
    // one of those writes would repaint the runway.
    mockGetRhythm.mockReturnValue({ ticks: TICKS });
    let notify = () => {};
    mockSubscribeToEntry.mockImplementation(
      (_trackId: string, callback: () => void) => {
        notify = callback;
        return () => {};
      },
    );

    const anchor = renderAnchor([makeTrack('a', { tempo: CONFIDENT })]);
    const first = anchor.current?.grid;

    act(() => notify());

    expect(anchor.current?.grid).toBe(first);
  });
});
