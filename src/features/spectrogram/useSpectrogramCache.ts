import { useEffect, useRef, useState } from 'react';
import { useAudioService } from '../audio/useAudioService';
import { type MelodyData } from '../transcription/MelodyExtractor';
import { type SpectrogramData } from './OfflineAnalyser';
import {
  loadMelodyData,
  loadRhythmData,
  loadSpectrogramData,
  saveMelodyData,
  saveRhythmData,
  saveSpectrogramData,
  type MelodyStoreData,
  type RhythmStoreData,
  type SpectrogramStoreData,
} from '../project/ProjectStorageService';
import { type RhythmData } from '../rhythm/RhythmAnalyser';
import { type TrackSpectrogramEntry } from './SpectrogramCache';
import { type TrackColor } from '../tracks/types';
import {
  DEFAULT_EFFECT_AMOUNTS,
  hashEffectAmounts,
  normalizeEffectsHash,
  type EffectAmounts,
} from '../tracks/EffectsChain';
import { type EchoSync } from '../tracks/echoSync';
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
    totalFrames: data.totalFrames,
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
    // Absent on rows persisted before mawimbi#540 — derive it the same way
    // the pre-milestone3 analysis path did, so legacy entries keep working.
    totalFrames:
      stored.totalFrames ?? Math.floor(stored.duration / stored.timeResolution),
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

export function toRhythmStoreData(
  trackId: string,
  rhythm: RhythmData,
): RhythmStoreData {
  return {
    trackId,
    bpm: rhythm.bpm,
    confidence: rhythm.confidence,
    ticks: rhythm.ticks,
    onsets: rhythm.onsets,
  };
}

export function fromRhythmStoreData(stored: RhythmStoreData): RhythmData {
  return {
    bpm: stored.bpm,
    confidence: stored.confidence,
    ticks: stored.ticks,
    onsets: stored.onsets,
  };
}

export function useSpectrogramCache(
  trackId: string,
  audioBuffer: AudioBuffer | undefined,
  color: TrackColor,
  effects: EffectAmounts = DEFAULT_EFFECT_AMOUNTS,
  echoSync: EchoSync | null = null,
) {
  const audioService = useAudioService();
  const [entry, setEntry] = useState<TrackSpectrogramEntry | undefined>();
  const schedulerRef = useRef<EffectsRefreshScheduler | null>(null);
  const effectsHash = hashEffectAmounts(effects, echoSync);

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

    let cancelled = false;

    const cached = audioService.spectrogramCache.getEntry(trackId);
    if (cached) {
      const cachedHash = cached.effectsParamsHash ?? DRY_EFFECTS_HASH;
      if (cachedHash === effectsHash) {
        setEntry(cached);
        if (cached.analysisComplete) return;

        // The cached entry is still being filled in by a chunked analysis
        // that this mount didn't itself start (e.g. it was already in
        // flight when this component mounted, or a previous mount's
        // analyse() call is still running after this one remounted).
        // Without this, the hook would silently treat a partial snapshot
        // as final and never learn about the remaining tiles or the
        // analysis completing (review fix, mawimbi#539).
        const unsubscribe = audioService.spectrogramCache.subscribeToEntry(
          trackId,
          (updated) => {
            if (!cancelled) setEntry(updated);
          },
        );
        return () => {
          cancelled = true;
          unsubscribe();
        };
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
          releaseFrames: (id) =>
            audioService.spectrogramCache.releaseFrames(id),
          onRefreshed: (id) =>
            setEntry(audioService.spectrogramCache.getEntry(id)),
        });
      }
      schedulerRef.current.schedule(
        trackId,
        audioBuffer,
        color,
        effects,
        echoSync,
      );
      return;
    }

    // The dry buffer analyses directly; any non-default effects need a
    // post-effect offline render first, whether this mount-time pass is
    // restoring a stale entry or has no prior entry at all.
    const renderForAnalysis = (): Promise<AudioBuffer> =>
      effectsHash === DRY_EFFECTS_HASH
        ? Promise.resolve(audioBuffer)
        : renderTrackOffline(audioBuffer, effects, echoSync);

    const loadOrAnalyse = async () => {
      // Check IndexedDB for previously stored spectrogram data
      const [storedSpectrogram, storedMelody, storedRhythm] = await Promise.all(
        [
          loadSpectrogramData(trackId),
          loadMelodyData(trackId),
          loadRhythmData(trackId),
        ],
      );

      if (cancelled) return;

      // Releases the entry's raw frames once persisted (spec 006 M3,
      // mawimbi#540) and re-syncs this hook's local state to the released
      // reference — without the re-sync, the closure's own `entry` state
      // would keep the old, frame-carrying object alive, defeating the
      // release. Guarded on `cancelled` since it runs after a fire-and-
      // forget `saveSpectrogramData` promise, detached from the effect's
      // synchronous flow.
      const releaseFramesAndSync = () => {
        audioService.spectrogramCache.releaseFrames(trackId);
        if (!cancelled) {
          setEntry(audioService.spectrogramCache.getEntry(trackId));
        }
      };

      // `setMelody`/`setRhythm` mutate the cached entry in place, so a fresh
      // object reference is what makes React re-render with the new data.
      const refreshEntry = () => {
        if (cancelled) return;
        const updated = audioService.spectrogramCache.getEntry(trackId);
        if (updated) {
          setEntry({ ...updated });
        }
      };

      // Called from both branches below, because a stored melody row is
      // independent of whether the *spectrogram* row survived — the same
      // reason `restoreOrExtractRhythm` below is. Reading `storedMelody`
      // only inside the restore branch discarded a perfectly good row and
      // re-ran Basic Pitch (~10s of TF.js, on the shared spectrogram worker,
      // delaying everything queued behind it) on every single load, forever.
      // Must run after the cache entry for this track exists — `setMelody`
      // writes onto it.
      const restoreOrExtractMelody = () => {
        if (storedMelody) {
          const melody = fromMelodyStoreData(storedMelody);
          audioService.spectrogramCache.setMelody(trackId, melody);
          console.log(
            `[melody] Restored ${melody.notes.length} cached notes for track ${trackId} from IndexedDB`,
          );
          refreshEntry();
          return;
        }
        // No stored row — the page closed before extraction finished, or the
        // IndexedDB save failed on a prior load.
        extractAndCacheMelody(audioService, trackId, audioBuffer, refreshEntry);
      };

      // Called from both branches below, because a stored rhythm row is
      // independent of whether the *spectrogram* row survived: the two are
      // written separately, and the megabyte-scale spectrogram write is far
      // likelier to fail (quota) than the kilobyte rhythm one. Reading
      // `storedRhythm` only inside the restore branch would discard a
      // perfectly good row and re-run the multi-second essentia pass on
      // every single load, forever (code review on PR #577). Must run after
      // the cache entry for this track exists — `setRhythm` writes onto it.
      const restoreOrExtractRhythm = () => {
        if (storedRhythm) {
          const rhythm = fromRhythmStoreData(storedRhythm);
          audioService.spectrogramCache.setRhythm(trackId, rhythm);
          console.log(
            `[rhythm] Restored cached rhythm for track ${trackId} from IndexedDB: bpm=${rhythm.bpm.toFixed(1)}, ${rhythm.ticks.length} ticks, ${rhythm.onsets.length} onsets`,
          );
          refreshEntry();
          return;
        }
        // No stored row — the track is new, the page closed before
        // extraction finished, or its write failed on a prior load.
        extractAndCacheRhythm(audioService, trackId, audioBuffer, refreshEntry);
      };

      if (storedSpectrogram) {
        // Normalized at the boundary where persisted data enters, so the
        // comparison below — and the `restore` that follows it, whose hash
        // every later in-memory comparison reads — all speak the current
        // format. A hash written before a macro existed still names the same
        // sound (spec 007 M2, #558); without this every track in every
        // existing project re-renders and re-analyses on first load.
        const storedHash = normalizeEffectsHash(
          storedSpectrogram.effectsParamsHash ?? DRY_EFFECTS_HASH,
        );

        if (storedHash === effectsHash) {
          const data = fromSpectrogramStoreData(storedSpectrogram);
          audioService.spectrogramCache.restore(
            trackId,
            data,
            color,
            storedHash,
          );
          // Already persisted (that's where it was just loaded from) — no
          // save to wait for, so release immediately, synchronously.
          audioService.spectrogramCache.releaseFrames(trackId);
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
            saveSpectrogramData(storeData)
              .catch((error) => {
                // Release still runs on failure (caught below) — the entry is
                // cheap to rebuild from the audio buffer next load if this
                // write never persisted (kb/decisions.md 2026-02-22); silently
                // leaving frames un-released for the rest of the session would
                // be worse than a logged, recoverable persist failure.
                console.warn(
                  `[spectrogram] Failed to persist track ${trackId} to IndexedDB:`,
                  error,
                );
              })
              .then(releaseFramesAndSync);
          }
        }

        restoreOrExtractMelody();
        restoreOrExtractRhythm();

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
        saveSpectrogramData(storeData)
          .catch((error) => {
            // Release still runs on failure (caught below) — the entry is
            // cheap to rebuild from the audio buffer next load if this
            // write never persisted (kb/decisions.md 2026-02-22); silently
            // leaving frames un-released for the rest of the session would
            // be worse than a logged, recoverable persist failure.
            console.warn(
              `[spectrogram] Failed to persist track ${trackId} to IndexedDB:`,
              error,
            );
          })
          .then(releaseFramesAndSync);
      }

      // Restore or extract melody in the background
      restoreOrExtractMelody();

      // Restore or extract rhythm in the background (spec 008 milestone 2)
      restoreOrExtractRhythm();
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
      // The track may have been deleted while extraction was in flight —
      // useDeleteTrackAudio's invalidate(trackId) (mawimbi#540) removes the
      // cache entry, which doubles here as the "still part of the project"
      // signal. Without this check, saveMelodyData would resurrect the
      // exact orphaned-row bug class this milestone's IndexedDB audit
      // fixed, just via a race instead of a missing delete call.
      if (!audioService.spectrogramCache.getEntry(trackId)) return;
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

function extractAndCacheRhythm(
  audioService: ReturnType<typeof useAudioService>,
  trackId: string,
  audioBuffer: AudioBuffer,
  onComplete: () => void,
): void {
  audioService.spectrogramCache
    .extractRhythmInWorker(audioBuffer)
    .then((rhythm) => {
      console.log(
        `[rhythm] Rhythm extraction complete for track ${trackId}: bpm=${rhythm.bpm.toFixed(1)}, ${rhythm.ticks.length} ticks, ${rhythm.onsets.length} onsets`,
      );
      // Same existence guard as melody's (mawimbi#540): the track may have
      // been deleted while extraction was in flight, and the cache entry's
      // absence is the "still part of the project" signal — without this
      // check, `saveRhythmData` would write a fresh orphaned `rhythms` row
      // after `useDeleteTrackAudio`'s cleanup already ran.
      if (!audioService.spectrogramCache.getEntry(trackId)) return;
      audioService.spectrogramCache.setRhythm(trackId, rhythm);
      saveRhythmData(toRhythmStoreData(trackId, rhythm)).catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(
          `[rhythm] Failed to persist rhythm for track ${trackId}: ${detail}`,
        );
      });
      onComplete();
    })
    .catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(
        `[rhythm] Rhythm extraction failed for track ${trackId}: ${detail}`,
      );
    });
}
