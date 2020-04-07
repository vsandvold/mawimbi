import { useEffect } from 'react';
import Tone from 'tone';
import useKeyPress from '../../hooks/useKeyPress';
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
      Tone.Transport.start();
    } else {
      Tone.Transport.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    Tone.Transport.seconds = seekTransportTime;
  }, [seekTransportTime]);

  return [];
};

export default useWorkstationEffect;
