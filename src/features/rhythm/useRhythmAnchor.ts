// useRhythmAnchor — resolves which track's pulse the runway renders, and
// keeps its induced grid current (spec 008 Decision 3, milestone 3).
//
// Two sources have to agree. The *selection* is a pure function of the
// track list (mute, solo, delete, and the tempo scalars `useTempoSync`
// copies onto each record), so it recomputes on any project-state change
// for free. The *ticks* live on the spectrogram cache entry, which owns no
// signal — so nothing re-renders when a worker round-trip lands, and a
// render-time poll of the kind `useClassificationSync` uses would read
// stale data indefinitely. `subscribeToEntry` is the mechanism that works
// (`useTempoSync` is the worked example), with one synchronous read first
// for data that arrived before the subscription.

import { useEffect, useMemo, useState } from 'react';
import { useAudioService } from '../audio/useAudioService';
import { type Track, type TrackId } from '../tracks/types';
import { induceBeatGrid } from './induceBeatGrid';
import {
  EMPTY_BEAT_GRID,
  buildBeatGrid,
  type BeatGrid,
} from './rhythmOverlayRenderer';
import { selectRhythmAnchor } from './selectRhythmAnchor';

export type RhythmAnchor = {
  trackId: TrackId;
  /** The induced grid, track-buffer relative (`startTime` not applied). */
  grid: BeatGrid;
  /** The anchor's own timeline offset — see `computeVisibleRungs`. */
  startTime: number;
};

/** One track's cached ticks, tagged with whose they are. */
type AnchorTicks = {
  trackId: TrackId;
  ticks: number[];
};

// Shared empty array, so "this track has no ticks yet" reads as the same
// value on every notification. A fresh `[]` per read would set new state on
// every cache write for every unrelated reason (melody landing, tiles
// refreshing), re-rendering the overlay each time.
const NO_TICKS: number[] = [];

/**
 * The current rhythm anchor, or `null` when no audible track has a tempo
 * estimate worth trusting — which renders as nothing at all.
 */
export function useRhythmAnchor(tracks: Track[]): RhythmAnchor | null {
  const audioService = useAudioService();

  const anchorTrackId = useMemo(() => selectRhythmAnchor(tracks), [tracks]);
  const anchorStartTime =
    tracks.find((track) => track.trackId === anchorTrackId)?.startTime ?? 0;

  const [cached, setCached] = useState<AnchorTicks | null>(null);

  useEffect(() => {
    if (anchorTrackId === null) {
      setCached(null);
      return;
    }
    const cache = audioService.spectrogramCache;
    const readTicks = () => {
      const ticks = cache.getRhythm(anchorTrackId)?.ticks ?? NO_TICKS;
      // Same ticks for the same track is not a change — `subscribeToEntry`
      // fires for every write to the entry, most of which are about melody
      // or tiles, and a fresh state object each time would re-render the
      // overlay on all of them.
      setCached((previous) =>
        previous?.trackId === anchorTrackId && previous.ticks === ticks
          ? previous
          : { trackId: anchorTrackId, ticks },
      );
    };

    readTicks();
    return cache.subscribeToEntry(anchorTrackId, readTicks);
  }, [anchorTrackId, audioService]);

  // The ticks are only usable while they belong to the *current* anchor.
  // Selection is synchronous (it falls straight out of `tracks`) but the
  // ticks arrive from an effect, so for one render after the anchor moves
  // the two describe different tracks — and `startTime` comes from the new
  // one. Pairing the old anchor's grid with the new anchor's offset paints
  // the whole grid at the wrong place (~1600 px off at the default zoom
  // when the new anchor is an overdub 8 s in) for that frame; discarding
  // is right, because rendering nothing for a frame is this feature's
  // defined behaviour whenever there is no usable grid, and the switch is
  // meant to snap anyway (spec Decision 3). Invisible in tests until an
  // overdub is involved: every uploaded track has `startTime: 0`
  // (`/code-review` on PR #585, the #484 class again).
  const ticks = cached?.trackId === anchorTrackId ? cached.ticks : NO_TICKS;

  // Derived, never persisted (spec Decision 2's amendment): recomputed
  // whenever the anchor's ticks change identity, which is the only thing
  // that can change the grid.
  const grid = useMemo(() => {
    if (ticks.length === 0) return EMPTY_BEAT_GRID;
    return buildBeatGrid(induceBeatGrid(ticks));
  }, [ticks]);

  if (anchorTrackId === null) return null;
  return { trackId: anchorTrackId, grid, startTime: anchorStartTime };
}
