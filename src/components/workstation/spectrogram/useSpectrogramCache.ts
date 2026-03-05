import { useEffect, useState } from 'react';
import { useAudioService } from '../../../hooks/useAudioService';
import { type SpectrogramData } from '../../../services/OfflineAnalyser';
import {
  loadSpectrogramData,
  saveSpectrogramData,
  type SpectrogramStoreData,
} from '../../../services/ProjectStorageService';
import { type TrackSpectrogramEntry } from '../../../services/SpectrogramCache';
import { type TrackColor } from '../../../types/track';

export function toSpectrogramStoreData(
  trackId: string,
  data: SpectrogramData,
): SpectrogramStoreData {
  return {
    trackId,
    frequencyFrames: data.frequencyFrames.map(
      (frame) => frame.buffer.slice(0) as ArrayBuffer,
    ),
    timeResolution: data.timeResolution,
    frequencyBinCount: data.frequencyBinCount,
    sampleRate: data.sampleRate,
    duration: data.duration,
  };
}

export function fromSpectrogramStoreData(
  stored: SpectrogramStoreData,
): SpectrogramData {
  return {
    frequencyFrames: stored.frequencyFrames.map(
      (buffer) => new Uint8Array(buffer),
    ),
    timeResolution: stored.timeResolution,
    frequencyBinCount: stored.frequencyBinCount,
    sampleRate: stored.sampleRate,
    duration: stored.duration,
  };
}

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

    const loadOrAnalyse = async () => {
      // Check IndexedDB for previously stored spectrogram data
      const stored = await loadSpectrogramData(trackId);

      if (cancelled) return;

      if (stored) {
        const data = fromSpectrogramStoreData(stored);
        audioService.spectrogramCache.restore(trackId, data, color);
        setEntry(audioService.spectrogramCache.getEntry(trackId));
        return;
      }

      // No cached data — run full analysis
      await audioService.spectrogramCache.analyse(trackId, audioBuffer, color);

      if (cancelled) return;

      const analysedEntry = audioService.spectrogramCache.getEntry(trackId);
      setEntry(analysedEntry);

      // Persist for future loads
      if (analysedEntry) {
        const storeData = toSpectrogramStoreData(trackId, analysedEntry.data);
        saveSpectrogramData(storeData);
      }
    };

    loadOrAnalyse();

    return () => {
      cancelled = true;
    };
  }, [trackId, audioBuffer, color, audioService]);

  return entry;
}
