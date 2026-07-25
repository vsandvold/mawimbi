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
import { selectRhythmAnchor } from './selectRhythmAnchor';

export type RhythmAnchor = {
  trackId: TrackId;
  /** Induced grid points, track-buffer relative (`startTime` not applied). */
  gridTimes: number[];
  /** The anchor's own timeline offset — see `computeVisibleRungs`. */
  startTime: number;
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

  const [ticks, setTicks] = useState<number[]>(NO_TICKS);

  useEffect(() => {
    if (anchorTrackId === null) {
      setTicks(NO_TICKS);
      return;
    }
    const cache = audioService.spectrogramCache;
    const readTicks = () =>
      setTicks(cache.getRhythm(anchorTrackId)?.ticks ?? NO_TICKS);

    readTicks();
    return cache.subscribeToEntry(anchorTrackId, readTicks);
  }, [anchorTrackId, audioService]);

  // Derived, never persisted (spec Decision 2's amendment): recomputed
  // whenever the anchor's ticks change identity, which is the only thing
  // that can change the grid.
  const gridTimes = useMemo(() => induceBeatGrid(ticks), [ticks]);

  if (anchorTrackId === null) return null;
  return { trackId: anchorTrackId, gridTimes, startTime: anchorStartTime };
}
