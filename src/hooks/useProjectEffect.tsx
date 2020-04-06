import { useEffect } from 'react';
import Tone from 'tone';
import useKeyPress from './useKeyPress';
import {
  ProjectDispatchAction,
  ProjectState,
  TOGGLE_PLAYING,
} from './useProjectState';

const useProjectEffect = (
  state: ProjectState,
  dispatch: React.Dispatch<ProjectDispatchAction>
) => {
  const { isPlaying, pixelsPerSecond, tracks, isDrawerOpen } = state;

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

export default useProjectEffect;
