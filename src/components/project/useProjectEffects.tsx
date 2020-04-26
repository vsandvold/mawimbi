import { useCallback } from 'react';
import AudioService from '../../services/AudioService';
import message from '../message';
import { ADD_TRACK, ProjectAction, ProjectState } from './projectReducer';

const useProjectEffects = (
  props: any,
  state: ProjectState,
  dispatch: React.Dispatch<ProjectAction>
) => {
  /*
   * Upload and decode audio file.
   */

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

  return { uploadFile };
};

export default useProjectEffects;
