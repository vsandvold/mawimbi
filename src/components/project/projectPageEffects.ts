import { useCallback, useEffect, useRef } from 'react';
import { useTrackService } from '../../hooks/useTrackService';
import {
  FullScreenHandle,
  useFullScreenHandle,
} from '../fullscreen/Fullscreen';
import message from '../message';
import { type Track } from '../../types/track';
import { ADD_TRACK, type ProjectAction } from './projectPageReducer';

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
        if (!trackHook.retrieveMixerChannel(track.trackId)) {
          const buffer = trackHook.retrieveAudioBuffer(track.trackId);
          if (buffer) {
            const normGainDb = trackHook.retrieveNormalizationGainDb(
              track.trackId,
            );
            trackHook.createMixerChannel(track.trackId, buffer, normGainDb);
          }
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
