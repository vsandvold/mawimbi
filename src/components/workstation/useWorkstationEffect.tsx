import { useEffect } from 'react';
import useKeyPress from '../../hooks/useKeyPress';
import AudioService from '../../services/AudioService';
import { WorkstationDispatchAction } from './useWorkstationContext';
import { TOGGLE_PLAYBACK, WorkstationState } from './useWorkstationState';

const useWorkstationEffect = (
  state: WorkstationState,
  dispatch: React.Dispatch<WorkstationDispatchAction>
) => {
  const { isPlaying, seekTransportTime } = state;

  useKeyPress(() => dispatch([TOGGLE_PLAYBACK]), {
    targetKey: ' ',
  });

  useEffect(() => {
    if (isPlaying) {
      AudioService.startPlayback();
    } else {
      AudioService.pausePlayback();
    }
  }, [isPlaying]);

  useEffect(() => {
    AudioService.setTransportTime(seekTransportTime);
  }, [seekTransportTime]);

  return [];
};

export default useWorkstationEffect;
