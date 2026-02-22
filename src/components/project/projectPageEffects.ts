import { useAudioService } from '../../hooks/useAudioService';
import { TrackSignalStore } from '../../signals/trackSignals';
import {
  FullScreenHandle,
  useFullScreenHandle,
} from '../fullscreen/Fullscreen';
import message from '../message';
import { ADD_TRACK, ProjectAction } from './projectPageReducer';

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
