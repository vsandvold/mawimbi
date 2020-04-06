import { useEffect } from 'react';
import Tone from 'tone';
import useKeyPress from '../../hooks/useKeyPress';
import { WorkstationDispatchAction } from './useWorkstationContext';
import { TOGGLE_PLAYING, WorkstationState } from './useWorkstationState';

const useWorkstationEffect = (
  state: WorkstationState,
  dispatch: React.Dispatch<WorkstationDispatchAction>
) => {
  const { isPlaying, pixelsPerSecond, isDrawerOpen } = state;

  useEffect(() => {
    if (isPlaying) {
      Tone.Transport.start();
    } else {
      Tone.Transport.pause();
    }
  }, [isPlaying]);

  useKeyPress(() => dispatch([TOGGLE_PLAYING]), {
    targetKey: ' ',
  });

  const stopPlayback = () => {
    Tone.Transport.stop();
    // setIsPlaying(false);
  };

  return [stopPlayback];
};

export default useWorkstationEffect;
