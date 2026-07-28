// SPIKE (mawimbi#593) — kicks off envelope extraction for every track
// String mode is showing, once each.
//
// Only runs while String mode is mounted, which is what keeps the default
// view's cost at exactly zero: the extraction re-runs the CQT (the spike
// may not persist envelopes, so a restored track has none — see
// `envelopeStore.ts`), and nobody should pay that for a view they are not
// looking at.
//
// **Extraction waits for the track's spectrogram analysis to complete.**
// Two separate defects come from not waiting (`/code-review` on PR #594),
// and one guard fixes both:
//
//  1. *The completion guard would fire on fresh uploads, not just
//     deletions.* `extractAndCacheMelody`/`Rhythm` use "the cache entry is
//     gone" as their still-part-of-the-project signal (mawimbi#540), and
//     this needs the same protection — but the entry does not exist *yet*
//     on a fresh upload. `useSpectrogramCache` awaits three IndexedDB reads
//     before posting its own request, while this hook posted synchronously,
//     so on the one shared FIFO worker the envelope CQT ran *first* and its
//     result came back before any entry existed. The guard then discarded a
//     perfectly good extraction and `releaseExtraction`d it, with no retry
//     (the effect only re-runs on `tracks`) — so the track silently never
//     got a ribbon unless some later dispatch happened to re-run the hook,
//     at the cost of a second full CQT.
//  2. *Head-of-line blocking.* Posting N envelope requests up front queued
//     N full CQTs ahead of every spectrogram, melody and rhythm request on
//     the shared worker — delaying the tiles, notes and onsets the ribbon
//     itself reads.
//
// Waiting on `analysisComplete` makes the entry's absence mean "deleted"
// again, and puts the envelope pass behind the work it depends on.

import { useEffect } from 'react';
import { useAudioService } from '../audio/useAudioService';
import { useTrackService } from '../tracks/useTrackService';
import { type Track } from '../tracks/types';
import {
  claimExtraction,
  getEnvelopes,
  releaseExtraction,
  setEnvelopes,
} from './envelopeStore';

export function useStringEnvelopes(tracks: Track[]): void {
  const audioService = useAudioService();
  const trackService = useTrackService();

  useEffect(() => {
    const { spectrogramCache } = audioService;
    const unsubscribes: Array<() => void> = [];

    const requestEnvelopes = (trackId: string) => {
      const audioBuffer = trackService.retrieveAudioBuffer(trackId);
      if (!audioBuffer) return;
      if (!claimExtraction(trackId)) return;

      spectrogramCache
        .extractEnvelopesInWorker(audioBuffer)
        .then((envelopes) => {
          // The track may have been deleted while extraction was in flight.
          // Now that the request is only ever made *after* the entry exists,
          // its absence unambiguously means `useDeleteTrackAudio`'s
          // `invalidate(trackId)` ran (mawimbi#540) — the same
          // still-part-of-the-project signal the melody and rhythm paths use.
          if (!spectrogramCache.getEntry(trackId)) {
            releaseExtraction(trackId);
            return;
          }
          setEnvelopes(trackId, envelopes);
        })
        .catch((error) => {
          const detail = error instanceof Error ? error.message : String(error);
          console.warn(
            `[string] Envelope extraction failed for track ${trackId}: ${detail}`,
          );
          releaseExtraction(trackId);
        });
    };

    for (const track of tracks) {
      const { trackId } = track;
      if (getEnvelopes(trackId)) continue;

      if (spectrogramCache.getEntry(trackId)?.analysisComplete) {
        requestEnvelopes(trackId);
        continue;
      }

      // Still analysing (or not started). `subscribeToEntry` is the same
      // channel `useSpectrogramCache`'s mid-analysis branch uses — the cache
      // owns no signal, so a render-time poll would sit on stale data until
      // some unrelated render happened to run it (#559).
      const unsubscribe = spectrogramCache.subscribeToEntry(
        trackId,
        (entry) => {
          if (!entry.analysisComplete) return;
          unsubscribe();
          requestEnvelopes(trackId);
        },
      );
      unsubscribes.push(unsubscribe);
    }

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    // Services are stable singletons behind their bridge hooks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);
}
