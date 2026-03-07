import { useEffect, useState } from 'react';
import { useAudioService } from '../../../hooks/useAudioService';
import { type MelodyData } from '../../../services/MelodyExtractor';
import { type SpectrogramData } from '../../../services/OfflineAnalyser';
import {
  loadMelodyData,
  loadSpectrogramData,
  saveMelodyData,
  saveSpectrogramData,
  type MelodyStoreData,
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

export function toMelodyStoreData(
  trackId: string,
  melody: MelodyData,
): MelodyStoreData {
  return {
    trackId,
    notes: melody.notes,
    timeResolution: melody.timeResolution,
  };
}

export function fromMelodyStoreData(stored: MelodyStoreData): MelodyData {
  return {
    notes: stored.notes,
    timeResolution: stored.timeResolution,
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
      const [storedSpectrogram, storedMelody] = await Promise.all([
        loadSpectrogramData(trackId),
        loadMelodyData(trackId),
      ]);

      if (cancelled) return;

      if (storedSpectrogram) {
        const data = fromSpectrogramStoreData(storedSpectrogram);
        audioService.spectrogramCache.restore(trackId, data, color);

        if (storedMelody) {
          const melody = fromMelodyStoreData(storedMelody);
          audioService.spectrogramCache.setMelody(trackId, melody);
        }

        setEntry(audioService.spectrogramCache.getEntry(trackId));
        return;
      }

      // No cached data — run full spectrogram analysis
      await audioService.spectrogramCache.analyse(trackId, audioBuffer, color);

      if (cancelled) return;

      const analysedEntry = audioService.spectrogramCache.getEntry(trackId);
      setEntry(analysedEntry);

      // Persist spectrogram for future loads
      if (analysedEntry) {
        const storeData = toSpectrogramStoreData(trackId, analysedEntry.data);
        saveSpectrogramData(storeData);
      }

      // Run melody extraction in the background
      extractAndCacheMelody(audioService, trackId, audioBuffer, () => {
        if (cancelled) return;
        const updated = audioService.spectrogramCache.getEntry(trackId);
        if (updated) {
          setEntry({ ...updated });
        }
      });
    };

    loadOrAnalyse();

    return () => {
      cancelled = true;
    };
  }, [trackId, audioBuffer, color, audioService]);

  return entry;
}

function extractAndCacheMelody(
  audioService: ReturnType<typeof useAudioService>,
  trackId: string,
  audioBuffer: AudioBuffer,
  onComplete: () => void,
): void {
  audioService.spectrogramCache
    .extractMelodyInWorker(audioBuffer)
    .then((melody) => {
      audioService.spectrogramCache.setMelody(trackId, melody);
      saveMelodyData(toMelodyStoreData(trackId, melody));
      onComplete();
    })
    .catch(() => {
      // Melody extraction is non-critical; silently ignore failures
    });
}
