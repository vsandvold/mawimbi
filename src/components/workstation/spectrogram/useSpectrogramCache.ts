import { useEffect, useState } from 'react';
import { useAudioService } from '../../../hooks/useAudioService';
import { type TrackSpectrogramEntry } from '../../../services/SpectrogramCache';
import { type TrackColor } from '../../../types/track';

export function useSpectrogramCache(
  trackId: string,
  audioBuffer: AudioBuffer | undefined,
  color: TrackColor,
) {
  const audioService = useAudioService();
  const [entry, setEntry] = useState<TrackSpectrogramEntry | undefined>();

  useEffect(() => {
    if (!audioBuffer) return;

    const cached = audioService.spectrogramCache.getEntry(trackId);
    if (cached) {
      setEntry(cached);
      return;
    }

    let cancelled = false;
    audioService.spectrogramCache
      .analyse(trackId, audioBuffer, color)
      .then(() => {
        if (!cancelled) {
          setEntry(audioService.spectrogramCache.getEntry(trackId));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, audioBuffer, color, audioService]);

  return entry;
}
