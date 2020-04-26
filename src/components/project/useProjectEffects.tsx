import { message } from 'antd';
import { useCallback } from 'react';
import AudioService from '../../services/AudioService';
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
    // FIXME: use unique messageKey per file to upload
    const messageKey = 'uploadFile';
    const reader = new FileReader();
    reader.onabort = () =>
      message.info({ content: file.name, key: messageKey });
    reader.onerror = () =>
      message.error({ content: file.name, key: messageKey });
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      AudioService.decodeAudioData(arrayBuffer)
        .then((audioBuffer) => {
          dispatch([ADD_TRACK, audioBuffer]);
          message.success({ content: file.name, key: messageKey });
        })
        .catch((error) => {
          message.error({ content: `${file.name}: ${error}`, key: messageKey });
        });
    };
    message.loading({ content: file.name, key: messageKey });
    reader.readAsArrayBuffer(file);
  }, []); // dispatch never changes, and can safely be omitted from dependencies

  return { uploadFile };
};

export default useProjectEffects;
