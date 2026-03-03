import { useCallback, useEffect, useRef } from 'react';
import { useTrackService } from '../../hooks/useAudioService';
import {
  FullScreenHandle,
  useFullScreenHandle,
} from '../fullscreen/Fullscreen';
import message from '../message';
import { type Track } from '../../types/track';
import { ADD_TRACK, type ProjectAction } from './projectPageReducer';

export const useUploadFile = (dispatch: React.Dispatch<ProjectAction>) => {
  const trackService = useTrackService();

  const uploadFile = useCallback(
    (file: File) => {
      const fileName = file.name;
      const msg = message({ key: `uploadFile-${fileName}` });
      const reader = new FileReader();
      reader.onabort = () => msg.info(fileName);
      reader.onerror = () => msg.error(fileName);
      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        trackService
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
    [trackService, dispatch],
  );

  return uploadFile;
};

export const useTrackSideEffects = (tracks: Track[]) => {
  const trackService = useTrackService();
  const previousTracksRef = useRef<Track[]>([]);

  useEffect(() => {
    const previousTracks = previousTracksRef.current;
    const prevIds = new Set(previousTracks.map((t) => t.trackId));
    const currIds = new Set(tracks.map((t) => t.trackId));

    // Tracks restored via undo/redo — recreate signals and mixer channels
    for (const track of tracks) {
      if (!prevIds.has(track.trackId)) {
        if (!trackService.getSignals(track.trackId)) {
          const initialVolume = trackService.retrieveInitialVolume(
            track.trackId,
          );
          trackService.createSignals(track.trackId, initialVolume);
        }
        if (!trackService.mixer.retrieveChannel(track.trackId)) {
          const buffer = trackService.retrieveAudioBuffer(track.trackId);
          if (buffer) {
            const normGainDb = trackService.retrieveNormalizationGainDb(
              track.trackId,
            );
            trackService.mixer.createChannel(track.trackId, buffer, normGainDb);
          }
        }
      }
    }

    // Tracks removed via undo/redo — dispose signals and mixer channels
    for (const track of previousTracks) {
      if (!currIds.has(track.trackId)) {
        trackService.disposeSignals(track.trackId);
        trackService.deleteChannel(track.trackId);
      }
    }

    previousTracksRef.current = tracks;
  }, [tracks, trackService]);
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
