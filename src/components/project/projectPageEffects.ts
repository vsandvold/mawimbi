import { useCallback, useEffect, useRef, useState } from 'react';
import { useTrackService } from '../../hooks/useTrackService';
import useDebounced from '../../hooks/useDebounced';
import {
  deleteAudioData,
  loadAudioData,
  loadProject,
  saveAudioData,
  saveProject,
  type StoredProject,
} from '../../services/ProjectStorageService';
import {
  FullScreenHandle,
  useFullScreenHandle,
} from '../fullscreen/Fullscreen';
import message from '../message';
import { type Track } from '../../types/track';
import {
  ADD_TRACK,
  type ProjectAction,
  type ProjectState,
} from './projectPageReducer';
import { createInitialState } from './useProjectReducer';

export const useUploadFile = (dispatch: React.Dispatch<ProjectAction>) => {
  const trackHook = useTrackService();

  const uploadFile = useCallback(
    (file: File) => {
      const fileName = file.name;
      const msg = message({ key: `uploadFile-${fileName}` });
      const reader = new FileReader();
      reader.onabort = () => msg.info(fileName);
      reader.onerror = () => msg.error(fileName);
      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        trackHook
          .createTrack(arrayBuffer)
          .then(({ trackId }) => {
            saveAudioData(trackId, arrayBuffer);
            dispatch([ADD_TRACK, { trackId, fileName }]);
            msg.success(fileName);
          })
          .catch((error) => {
            msg.error(`${fileName}: ${error}`);
          });
      };
      msg.loading(fileName);
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
          const initialVolume = trackHook.retrieveInitialVolume(track.trackId);
          trackHook.createSignals(track.trackId, initialVolume);
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
