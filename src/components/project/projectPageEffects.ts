import { useCallback } from 'react';
import AudioService from '../../services/AudioService';
import {
  FullScreenHandle,
  useFullScreenHandle,
} from '../fullscreen/Fullscreen';
import message from '../message';
import { ADD_TRACK, ProjectAction } from './projectPageReducer';

export const useUploadFile = (dispatch: React.Dispatch<ProjectAction>) => {
  const uploadFile = useCallback((file: File) => {
    const msg = message({ key: `uploadFile-${file.name}` });
    const reader = new FileReader();
    reader.onabort = () => msg.info(file.name);
    reader.onerror = () => msg.error(file.name);
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      AudioService.decodeAudioData(arrayBuffer)
        .then((audioBuffer) => {
          dispatch([ADD_TRACK, audioBuffer]);
          msg.success(file.name);
        })
        .catch((error) => {
          msg.error(`${file.name}: ${error}`);
        });
    };
    msg.loading(file.name);
    reader.readAsArrayBuffer(file);
  }, []); // dispatch never changes, and can safely be omitted from dependencies

  return uploadFile;
};

export const useFullscreen = () => {
  const fullScreenHandle = useFullScreenHandle();

  const toggleFullscreen = useCallback((state?: boolean) => {
    const activateFullscreen = state ?? !fullScreenHandle.active;
    if (activateFullscreen) {
      fullScreenHandle.enter();
    } else {
      fullScreenHandle.exit();
    }
  }, []); // fullScreenHandle omitted from deps on purpose

  return [fullScreenHandle, toggleFullscreen] as [
    FullScreenHandle,
    (state?: boolean) => void
  ];
};
