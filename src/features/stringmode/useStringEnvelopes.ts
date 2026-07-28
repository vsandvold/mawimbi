// SPIKE (mawimbi#593) — kicks off envelope extraction for every track
// String mode is showing, once each.
//
// Only runs while String mode is mounted, which is what keeps the default
// view's cost at exactly zero: the extraction re-runs the CQT (the spike
// may not persist envelopes, so a restored track has none — see
// `envelopeStore.ts`), and nobody should pay that for a view they are not
// looking at.

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
    for (const track of tracks) {
      const { trackId } = track;
      if (getEnvelopes(trackId)) continue;
      const audioBuffer = trackService.retrieveAudioBuffer(trackId);
      if (!audioBuffer) continue;
      if (!claimExtraction(trackId)) continue;

      audioService.spectrogramCache
        .extractEnvelopesInWorker(audioBuffer)
        .then((envelopes) => {
          // The track may have been deleted while extraction was in flight;
          // the cache entry's absence is the "still part of the project"
          // signal the melody and rhythm paths already use (mawimbi#540).
          // Without it a deleted track gets a fresh orphaned envelope row
          // written back after cleanup already ran.
          if (!audioService.spectrogramCache.getEntry(trackId)) {
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
    }
    // Services are stable singletons behind their bridge hooks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);
}
