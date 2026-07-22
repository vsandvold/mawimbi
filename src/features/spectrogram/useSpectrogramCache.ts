import { useEffect, useRef, useState } from 'react';
import { useAudioService } from '../audio/useAudioService';
import { type MelodyData } from '../transcription/MelodyExtractor';
import { type SpectrogramData } from './OfflineAnalyser';
import {
  loadMelodyData,
  loadSpectrogramData,
  saveMelodyData,
  saveSpectrogramData,
  type MelodyStoreData,
  type SpectrogramStoreData,
} from '../project/ProjectStorageService';
import { type TrackSpectrogramEntry } from './SpectrogramCache';
import { type TrackColor } from '../tracks/types';
import {
  DEFAULT_EFFECT_AMOUNTS,
  hashEffectAmounts,
  type EffectAmounts,
} from '../tracks/EffectsChain';
import renderTrackOffline from '../tracks/renderTrackOffline';
import { EffectsRefreshScheduler } from '../workstation/effectsRefresh';

const DRY_EFFECTS_HASH = hashEffectAmounts(DEFAULT_EFFECT_AMOUNTS);

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
  effects: EffectAmounts = DEFAULT_EFFECT_AMOUNTS,
) {
  const audioService = useAudioService();
  const [entry, setEntry] = useState<TrackSpectrogramEntry | undefined>();
  const schedulerRef = useRef<EffectsRefreshScheduler | null>(null);
  const effectsHash = hashEffectAmounts(effects);

  // The scheduler is per-hook-instance (one per rendered track), so its
  // debounce naturally scopes per track with no cross-track bookkeeping.
  useEffect(() => {
    return () => {
      schedulerRef.current?.dispose();
      schedulerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!audioBuffer) return;

    const cached = audioService.spectrogramCache.getEntry(trackId);
    if (cached) {
      const cachedHash = cached.effectsParamsHash ?? DRY_EFFECTS_HASH;
      if (cachedHash === effectsHash) {
        setEntry(cached);
        return;
      }

      // Already analysed this session but for different effect amounts —
      // a committed effect change (spec 004 M6, #494). Debounce+supersede
      // through the scheduler instead of re-analysing inline, so rapid
      // commits coalesce into one analysis and a stale in-flight render
      // never clobbers a newer one.
      if (!schedulerRef.current) {
        schedulerRef.current = new EffectsRefreshScheduler({
          renderOffline: renderTrackOffline,
          analyseToResult: (buffer, col) =>
            audioService.spectrogramCache.analyseToResult(buffer, col),
          setEntry: (id, result, hash) =>
            audioService.spectrogramCache.setEntry(
              id,
              result.data,
              result.tiles,
              hash,
            ),
          onRefreshed: (id) =>
            setEntry(audioService.spectrogramCache.getEntry(id)),
        });
      }
      schedulerRef.current.schedule(trackId, audioBuffer, color, effects);
      return;
    }

    let cancelled = false;

    // The dry buffer analyses directly; any non-default effects need a
    // post-effect offline render first, whether this mount-time pass is
    // restoring a stale entry or has no prior entry at all.
    const renderForAnalysis = (): Promise<AudioBuffer> =>
      effectsHash === DRY_EFFECTS_HASH
        ? Promise.resolve(audioBuffer)
        : renderTrackOffline(audioBuffer, effects);

    const loadOrAnalyse = async () => {
      // Check IndexedDB for previously stored spectrogram data
      const [storedSpectrogram, storedMelody] = await Promise.all([
        loadSpectrogramData(trackId),
        loadMelodyData(trackId),
      ]);

      if (cancelled) return;

      if (storedSpectrogram) {
        const storedHash =
          storedSpectrogram.effectsParamsHash ?? DRY_EFFECTS_HASH;

        if (storedHash === effectsHash) {
          const data = fromSpectrogramStoreData(storedSpectrogram);
          audioService.spectrogramCache.restore(
            trackId,
            data,
            color,
            storedHash,
          );
        } else {
          // The persisted spectrogram is stale against the track's current
          // committed effects (e.g. the page reloaded mid-debounce) —
          // render and re-analyse once, immediately; no debounce needed
          // for a single mount-time correction.
          const rendered = await renderForAnalysis();
          if (cancelled) return;
          await audioService.spectrogramCache.analyse(
            trackId,
            rendered,
            color,
            effectsHash,
            (progressEntry) => {
              if (!cancelled) setEntry(progressEntry);
            },
          );
          if (cancelled) return;
          const refreshed = audioService.spectrogramCache.getEntry(trackId);
          if (refreshed) {
            const storeData = toSpectrogramStoreData(trackId, refreshed.data);
            storeData.effectsParamsHash = effectsHash;
            saveSpectrogramData(storeData);
          }
        }

        if (storedMelody) {
          const melody = fromMelodyStoreData(storedMelody);
          audioService.spectrogramCache.setMelody(trackId, melody);
          console.log(
            `[melody] Restored ${melody.notes.length} cached notes for track ${trackId} from IndexedDB`,
          );
        } else {
          // Melody data missing from IndexedDB — run extraction now.
          // This happens when the page was closed before extraction
          // completed, or the IndexedDB save failed on a prior load.
          extractAndCacheMelody(audioService, trackId, audioBuffer, () => {
            if (cancelled) return;
            const updated = audioService.spectrogramCache.getEntry(trackId);
            if (updated) {
              setEntry({ ...updated });
            }
          });
        }

        setEntry(audioService.spectrogramCache.getEntry(trackId));
        return;
      }

      // No cached data anywhere. New tracks always start at
      // DEFAULT_EFFECT_AMOUNTS, so this is normally the dry render — but a
      // commit can land while this very analysis is still in flight (a
      // long track's CQT analysis takes real time; the effect above
      // aborts via `cancelled` and re-enters here with the new
      // `effectsHash`), so render through the current `effects` rather
      // than assuming dry.
      const rendered = await renderForAnalysis();
      if (cancelled) return;
      await audioService.spectrogramCache.analyse(
        trackId,
        rendered,
        color,
        effectsHash,
        (progressEntry) => {
          if (!cancelled) setEntry(progressEntry);
        },
      );

      if (cancelled) return;

      const analysedEntry = audioService.spectrogramCache.getEntry(trackId);
      setEntry(analysedEntry);

      // Persist spectrogram for future loads
      if (analysedEntry) {
        const storeData = toSpectrogramStoreData(trackId, analysedEntry.data);
        storeData.effectsParamsHash = effectsHash;
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
    // effectsHash is the canonical identity of `effects` — depending on it
    // instead of the object avoids re-running for referentially-new but
    // value-equal amounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, audioBuffer, color, effectsHash, audioService]);

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
      console.log(
        `[melody] Melody extraction complete for track ${trackId}: ${melody.notes.length} notes`,
      );
      audioService.spectrogramCache.setMelody(trackId, melody);
      saveMelodyData(toMelodyStoreData(trackId, melody));
      onComplete();
    })
    .catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(
        `[melody] Melody extraction failed for track ${trackId}: ${detail}`,
      );
    });
}
