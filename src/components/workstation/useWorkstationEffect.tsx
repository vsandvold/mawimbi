import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import useKeypress from '../../hooks/useKeypress';
import AudioService from '../../services/AudioService';
import { WorkstationDispatchAction } from './useWorkstationContext';
import { TOGGLE_PLAYBACK, WorkstationState } from './useWorkstationState';

const useWorkstationEffect = (
  state: WorkstationState,
  dispatch: React.Dispatch<WorkstationDispatchAction>
) => {
  const { isPlaying, transportTime } = state;

  /*
   * Use spacebar to toggle playback.
   */

  useKeypress(() => dispatch([TOGGLE_PLAYBACK]), {
    targetKey: ' ',
  });

  /*
   * Toggle audio playback.
   */

  useEffect(() => {
    if (isPlaying) {
      AudioService.startPlayback();
    } else {
      AudioService.pausePlayback();
    }
  }, [isPlaying]);

  /*
   * Set transport time.
   */

  useEffect(() => {
    AudioService.setTransportTime(transportTime);
  }, [transportTime]);

  /*
   * Compute scale factor for timeline transform when drawer is open.
   */

  const [timelineScaleFactor, setTimelineScaleFactor] = useState(1.0);

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const drawerContainerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (timelineContainerRef.current && drawerContainerRef.current) {
      const {
        height: timelineHeight,
      } = timelineContainerRef.current.getBoundingClientRect();
      const {
        height: drawerHeight,
      } = drawerContainerRef.current.getBoundingClientRect();
      const scaleFactor = (timelineHeight - drawerHeight) / timelineHeight;
      setTimelineScaleFactor(scaleFactor);
    }
  }, []);

  /*
   * Activate dropzone on file drag
   */

  const [isDragActive, setIsDragActive] = useState(false);
  const [dropzoneRootProps, setDropzoneRootProps] = useState({});

  return {
    drawerContainerRef,
    timelineContainerRef,
    timelineScaleFactor,
    isDragActive,
    setIsDragActive,
    dropzoneRootProps,
    setDropzoneRootProps,
  };
};

export default useWorkstationEffect;
