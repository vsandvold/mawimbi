import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAudioService } from '../../hooks/useAudioService';
import useKeypress from '../../hooks/useKeypress';
import { TrackSignalStore } from '../../signals/trackSignals';
import {
  togglePlayback,
  totalTime as totalTimeSignal,
} from '../../signals/transportSignals';
import message from '../message';
import { ADD_TRACK, Track } from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';

export const useSpacebarPlaybackToggle = () => {
  useKeypress(() => togglePlayback(), {
    targetKey: ' ',
  });
};

export const useTotalTime = (tracks: Track[]) => {
  const audioService = useAudioService();
  useEffect(() => {
    totalTimeSignal.value = audioService.getTotalTime();
  }, [tracks]);
};

export const useMicrophone = (isRecording: boolean) => {
  const audioService = useAudioService();
  const projectDispatch = useProjectDispatch();
  useEffect(() => {
    const msg = message({ key: 'microphone' });
    const startRecording = async () => {
      try {
        await audioService.microphone.open();
        await audioService.startRecording();
        msg.success('Recording started');
      } catch {
        msg.error('Recording failed');
      }
    };
    const stopRecording = async () => {
      if (!audioService.isRecording()) {
        return;
      }
      try {
        const arrayBuffer = await audioService.stopRecording();
        const trackId = await audioService.createTrack(arrayBuffer);
        TrackSignalStore.create(trackId);
        projectDispatch([ADD_TRACK, { trackId, fileName: 'New Track' }]);
        audioService.microphone.close();
        msg.success('Recording stopped');
      } catch {
        msg.error('Recording failed');
      }
    };
    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [isRecording]);
};

export const useMixerHeight = () => {
  const mixerContainerRef = useRef<HTMLDivElement>(null);
  const [mixerHeight, setMixerHeight] = useState(0);

  useLayoutEffect(() => {
    if (mixerContainerRef.current) {
      // TODO: or use clientHeight?
      const height = mixerContainerRef.current.offsetHeight;
      setMixerHeight(height);
    }
  }, []); // make sure effect only triggers once, on component mount

  return {
    mixerContainerRef,
    mixerHeight,
  };
};

export const useDropzoneDragActive = () => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [dropzoneRootProps, setDropzoneRootProps] = useState({});

  return {
    isDragActive,
    setIsDragActive,
    dropzoneRootProps,
    setDropzoneRootProps,
  };
};
