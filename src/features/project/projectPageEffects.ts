import { useCallback, useEffect, useRef, useState } from 'react';
import { useTrackService } from '../tracks/useTrackService';
import useDebounced from '../../shared/hooks/useDebounced';
import {
  deleteAudioData,
  deleteSpectrogramData,
  deleteTranscription,
  loadAudioData,
  loadProject,
  saveAudioData,
  saveProject,
  type StoredProject,
} from './ProjectStorageService';
import {
  FullScreenHandle,
  useFullScreenHandle,
} from '../../shared/fullscreen/Fullscreen';
import useMessage from '../../shared/message';
import { EFFECT_ORDER, type EffectAmounts } from '../tracks/EffectsChain';
import { type Track, type TrackId } from '../tracks/types';
import {
  ADD_TRACK,
  type ProjectAction,
  type ProjectState,
} from './projectPageReducer';
import { createInitialState } from './useProjectReducer';

export const useUploadFile = (dispatch: React.Dispatch<ProjectAction>) => {
  const trackHook = useTrackService();
  const message = useMessage();

  const uploadFile = useCallback(
    (file: File) => {
      const fileName = file.name;
      const key = `uploadFile-${fileName}`;
      const reader = new FileReader();
      reader.onabort = () => message(fileName, { type: 'info', key });
      reader.onerror = () => message(fileName, { type: 'error', key });
      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        // Clone before createTrack — decodeAudioData detaches the original
        // ArrayBuffer, making it unusable for IndexedDB storage.
        const audioDataForStorage = arrayBuffer.slice(0);
        trackHook
          .createTrack(arrayBuffer)
          .then(({ trackId }) => {
            saveAudioData(trackId, audioDataForStorage);
            dispatch([ADD_TRACK, { trackId, fileName }]);
            message(fileName, { type: 'success', key });
          })
          .catch((error) => {
            message(`${fileName}: ${error}`, { type: 'error', key });
          });
      };
      message(fileName, { type: 'loading', key });
      reader.readAsArrayBuffer(file);
    },
    // Hook callbacks reference stable service singletons
    [dispatch], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return uploadFile;
};

export const useTrackSideEffects = (tracks: Track[]) => {
  const trackHook = useTrackService();
  const previousTracksRef = useRef<Track[]>([]);

  useEffect(() => {
    const previousTracks = previousTracksRef.current;
    const prevIds = new Set(previousTracks.map((t) => t.trackId));
    const currIds = new Set(tracks.map((t) => t.trackId));

    // Tracks restored via undo/redo — recreate signals and mixer channels
    for (const track of tracks) {
      if (!prevIds.has(track.trackId)) {
        if (!trackHook.getSignals(track.trackId)) {
          const initialVolume =
            track.volume ?? trackHook.retrieveInitialVolume(track.trackId);
          trackHook.createSignals(
            track.trackId,
            initialVolume,
            track.effects,
            track.mute,
            track.solo,
          );
        }
        if (!trackHook.retrieveChannel(track.trackId)) {
          trackHook.recreateChannel(track.trackId);
        }
      }
    }

    // Tracks removed via undo/redo — dispose signals and mixer channels
    for (const track of previousTracks) {
      if (!currIds.has(track.trackId)) {
        trackHook.disposeSignals(track.trackId);
        trackHook.deleteChannel(track.trackId);
      }
    }

    previousTracksRef.current = tracks;
    // Hook callbacks reference stable service singletons
  }, [tracks]); // eslint-disable-line react-hooks/exhaustive-deps
};

type SyncedControls = {
  effects: EffectAmounts | undefined;
  volume: number | undefined;
  mute: boolean | undefined;
  solo: boolean | undefined;
};

// Reflects volume/mute/solo/effect changes that arrive via undo/redo (not a
// live slider drag or mute/solo click, which already write the signal
// directly) into the live per-track signals — otherwise an undo after
// committing a change reverts the persisted project state while the audio
// and mixer/drawer controls keep showing the pre-undo value (the #212
// regression class, extended to every persisted per-track control).
//
// Diffs each field against the *last value this hook itself saw* for that
// track, not against the live signal: the reducer's other actions
// (DELETE_TRACK/MOVE_TRACK reindexing, SET_INSTRUMENT from background
// classification) all rebuild track objects but pass unrelated fields
// through unchanged (by value for volume/mute/solo, by reference for the
// `effects` object — only SET_TRACK_EFFECT ever constructs a new one).
// Comparing against the live signal instead would re-apply the
// last-committed value on every unrelated tracks-array change — including
// while a slider drag was still live — clobbering the in-progress drag.
export const useTrackControlsSync = (tracks: Track[]) => {
  const trackHook = useTrackService();
  const lastSyncedRef = useRef(new Map<TrackId, SyncedControls>());

  useEffect(() => {
    for (const track of tracks) {
      const current: SyncedControls = {
        effects: track.effects,
        volume: track.volume,
        mute: track.mute,
        solo: track.solo,
      };
      const last = lastSyncedRef.current.get(track.trackId);
      lastSyncedRef.current.set(track.trackId, current);

      const signals = trackHook.getSignals(track.trackId);
      if (!signals) continue;

      if (current.effects !== undefined && current.effects !== last?.effects) {
        for (const effectId of EFFECT_ORDER) {
          signals.effects[effectId].value = current.effects[effectId];
        }
      }
      if (current.volume !== undefined && current.volume !== last?.volume) {
        signals.volume.value = current.volume;
      }
      if (current.mute !== undefined && current.mute !== last?.mute) {
        signals.mute.value = current.mute;
      }
      if (current.solo !== undefined && current.solo !== last?.solo) {
        signals.solo.value = current.solo;
      }
    }
    // Hook callbacks reference stable service singletons
  }, [tracks]); // eslint-disable-line react-hooks/exhaustive-deps
};

function toStoredProject(state: ProjectState): StoredProject {
  const now = Date.now();
  return {
    id: state.id,
    title: state.title,
    tracks: state.tracks,
    nextColorId: state.nextColorId,
    nextIndex: state.nextIndex,
    createdAt: now,
    updatedAt: now,
  };
}

function fromStoredProject(stored: StoredProject): ProjectState {
  return {
    id: stored.id,
    title: stored.title,
    tracks: stored.tracks,
    nextColorId: stored.nextColorId,
    nextIndex: stored.nextIndex,
  };
}

export const useLoadProject = (id: string): ProjectState | null => {
  const [initialState, setInitialState] = useState<ProjectState | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadProject(id).then((stored) => {
      if (cancelled) return;

      if (stored) {
        setInitialState(fromStoredProject(stored));
      } else {
        const newState = createInitialState(id);
        saveProject(toStoredProject(newState));
        setInitialState(newState);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return initialState;
};

const AUTO_SAVE_DEBOUNCE_MS = 250;

export const useAutoSave = (state: ProjectState) => {
  const createdAtRef = useRef<number | null>(null);

  // Capture createdAt from the initial save so subsequent saves preserve it
  useEffect(() => {
    loadProject(state.id).then((stored) => {
      if (stored) {
        createdAtRef.current = stored.createdAt;
      }
    });
    // Only run on mount
  }, [state.id]);

  const save = useDebounced(
    () => {
      const stored = toStoredProject(state);
      if (createdAtRef.current) {
        stored.createdAt = createdAtRef.current;
      }
      saveProject(stored);
    },
    { timeoutMs: AUTO_SAVE_DEBOUNCE_MS },
  );

  // Skip the initial render — useLoadProject already saves new projects
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    save();
    // save is stable (useMemo in useDebounced)
  }, [state, save]);
};

export const useRestoreAudio = (tracks: Track[]) => {
  const trackHook = useTrackService();
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const results = await Promise.all(
        tracks.map(async (track) => {
          const audioData = await loadAudioData(track.trackId);
          return { track, audioData };
        }),
      );

      if (cancelled) return;

      for (const { track, audioData } of results) {
        if (cancelled) break;
        if (!audioData) continue;
        try {
          await trackHook.restoreTrack(
            track.trackId,
            audioData,
            track.startTime ?? 0,
            {
              effects: track.effects,
              volume: track.volume,
              mute: track.mute,
              solo: track.solo,
            },
          );
        } catch {
          // Audio data corrupted or decode failed — skip this track
        }
      }

      if (!cancelled) {
        setIsRestoring(false);
      }
    };

    if (tracks.length === 0) {
      setIsRestoring(false);
    } else {
      restore();
    }

    return () => {
      cancelled = true;
    };
    // Runs once on mount with the initial tracks from the stored project
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return isRestoring;
};

export const useDeleteTrackAudio = (tracks: Track[]) => {
  const previousTracksRef = useRef<Track[]>(tracks);

  useEffect(() => {
    const previousTracks = previousTracksRef.current;
    const currIds = new Set(tracks.map((t) => t.trackId));

    for (const track of previousTracks) {
      if (!currIds.has(track.trackId)) {
        deleteAudioData(track.trackId);
        deleteSpectrogramData(track.trackId);
        deleteTranscription(track.trackId);
      }
    }

    previousTracksRef.current = tracks;
  }, [tracks]);
};

export const useFullscreen = () => {
  const fullScreenHandle = useFullScreenHandle();

  const toggleFullscreen = useCallback(
    (state?: boolean) => {
      const activateFullscreen = state ?? !fullScreenHandle.active;
      if (activateFullscreen) {
        fullScreenHandle.enter();
      } else {
        fullScreenHandle.exit();
      }
    },
    [fullScreenHandle],
  );

  return [fullScreenHandle, toggleFullscreen] as [
    FullScreenHandle,
    (state?: boolean) => void,
  ];
};
