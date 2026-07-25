// selectRhythmAnchor — which track's pulse the beat rungs render (spec 008
// Decision 3).
//
// Meter perception induces *one* pulse from the combined stream
// (kb/product.md, "one stream, focusable sources"), so there is one grid,
// not one per track: competing grids would be perceptually false and
// visually chaotic. The grid follows the audible track whose tempo estimate
// is strongest, which keeps it attached to what the listener is actually
// hearing — and leaves genuine cross-track tempo disagreement visible as
// the other tracks' onsets drifting against the rungs, rather than hidden
// behind an averaged grid.
//
// Pure and cheap by design: it is re-run on every mute, solo, delete, and
// analysis result, and "no qualifying track" is a first-class answer that
// renders as nothing at all (spec Goal 2: no anchor, no rungs, no mystery).

import { type Track, type TrackId } from '../tracks/types';
import { isConfidentTempo } from './tempo';

/**
 * The track whose induced beat grid should be rendered, or `null` when no
 * audible track has a tempo estimate worth trusting.
 *
 * Ranks by `Track.tempo.confidence` among audible tracks that clear
 * `MIN_TEMPO_CONFIDENCE` — the same threshold the effects drawer's BPM
 * badge and tempo-synced Echo read (`tempo.ts`). One definition of
 * "confident tempo", so a grid can never decline to render for a track
 * whose BPM badge is showing on the same screen.
 */
export function selectRhythmAnchor(tracks: Track[]): TrackId | null {
  // Solo makes every un-soloed track inaudible, so audibility isn't just
  // `!track.mute` — this mirrors `TrackService`'s own `mutedTracks` rule
  // against the project record instead of the engine's signals. The two
  // can't drift: `SET_TRACK_MUTE_SOLO` writes both fields from the same
  // handler that writes the signals (`useChannelControls`).
  const hasSolo = tracks.some((track) => track.solo);
  const audible = tracks.filter(
    (track) => !track.mute && (!hasSolo || track.solo),
  );

  let anchor: Track | null = null;
  for (const track of audible) {
    if (!isConfidentTempo(track.tempo)) continue;
    // Strictly greater, so an equally-confident later track never displaces
    // an earlier one: ties break toward the front of the list. Track
    // records carry no creation timestamp (`trackId` is a v4 UUID and
    // `index` is renumbered on every reorder), so list order is the
    // strongest available stand-in for "earliest" — and what the tie-break
    // is really for is that the same inputs always pick the same anchor,
    // which it delivers regardless.
    if (anchor === null || track.tempo!.confidence > anchor.tempo!.confidence) {
      anchor = track;
    }
  }

  return anchor?.trackId ?? null;
}
