import { useEffect } from 'react';
import AudioService from '../../services/AudioService';
import { ProjectDispatchAction } from './useProjectContext';
import { ADD_TRACK, ProjectState } from './useProjectState';

const useProjectEffect = (
  state: ProjectState,
  dispatch: React.Dispatch<ProjectDispatchAction>
) => {
  const { bufferToDecode } = state;

  useEffect(() => {
    if (bufferToDecode) {
      AudioService.decodeAudioData(bufferToDecode).then((audioBuffer) =>
        dispatch([ADD_TRACK, audioBuffer])
      );
    }
  }, [bufferToDecode, dispatch]);
};

export default useProjectEffect;
