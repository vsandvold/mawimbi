import { useEffect, useRef } from 'react';
import { useAudioService } from '../../hooks/useAudioService';
import { TrackSignalStore } from '../../signals/trackSignals';
import {
  FullScreenHandle,
  useFullScreenHandle,
} from '../fullscreen/Fullscreen';
import message from '../message';
import { ADD_TRACK, ProjectAction, Track } from './projectPageReducer';

export const useUploadFile = (dispatch: React.Dispatch<ProjectAction>) => {
  const audioService = useAudioService();

  const uploadFile = (file: File) => {
    const fileName = file.name;
    const msg = message({ key: `uploadFile-${fileName}` });
    const reader = new FileReader();
    reader.onabort = () => msg.info(fileName);
    reader.onerror = () => msg.error(fileName);
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      audioService
        .createTrack(arrayBuffer)
        .then((trackId) => {
          TrackSignalStore.create(trackId);
          dispatch([ADD_TRACK, { trackId, fileName }]);
          msg.success(fileName);
        })
        .catch((error) => {
          msg.error(`${fileName}: ${error}`);
        });
    };
    msg.loading(fileName);
    reader.readAsArrayBuffer(file);
  };

  return uploadFile;
};

export const useTrackSideEffects = (tracks: Track[]) => {
  const audioService = useAudioService();
  const previousTracksRef = useRef<Track[]>([]);

  useEffect(() => {
    const previousTracks = previousTracksRef.current;
    const prevIds = new Set(previousTracks.map((t) => t.trackId));
    const currIds = new Set(tracks.map((t) => t.trackId));

    // Tracks restored via undo/redo — recreate signals and mixer channels
    for (const track of tracks) {
      if (!prevIds.has(track.trackId)) {
        if (!TrackSignalStore.get(track.trackId)) {
          TrackSignalStore.create(track.trackId);
        }
        if (!audioService.mixer.retrieveChannel(track.trackId)) {
          const buffer = audioService.retrieveAudioBuffer(track.trackId);
          if (buffer) {
            audioService.mixer.createChannel(track.trackId, buffer);
          }
        }
      }
    }

    // Tracks removed via undo/redo — dispose signals and mixer channels
    for (const track of previousTracks) {
      if (!currIds.has(track.trackId)) {
        TrackSignalStore.dispose(track.trackId);
        audioService.mixer.deleteChannel(track.trackId);
      }
    }

    previousTracksRef.current = tracks;
  }, [tracks]); // audioService is a stable singleton
};

export const useFullscreen = () => {
  const fullScreenHandle = useFullScreenHandle();

  const toggleFullscreen = (state?: boolean) => {
    const activateFullscreen = state ?? !fullScreenHandle.active;
    if (activateFullscreen) {
      fullScreenHandle.enter();
    } else {
      fullScreenHandle.exit();
    }
  };

  return [fullScreenHandle, toggleFullscreen] as [
    FullScreenHandle,
    (state?: boolean) => void,
  ];
};
