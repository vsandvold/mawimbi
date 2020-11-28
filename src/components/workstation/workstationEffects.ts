import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAudioService } from '../../hooks/useAudioService';
import useKeypress from '../../hooks/useKeypress';
import message from '../message';
import { ADD_TRACK, Track } from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';
import {
  SET_MUTED_TRACKS,
  SET_TOTAL_TIME,
  TOGGLE_PLAYBACK,
  WorkstationAction,
} from './workstationReducer';

export const useMutedTracks = (
  tracks: Track[],
  dispatch: React.Dispatch<WorkstationAction>
) => {
  const audioService = useAudioService();
  useEffect(() => {
    const mutedTracks = audioService.mixer.getMutedChannels();
    dispatch([SET_MUTED_TRACKS, mutedTracks]);
  }, [tracks]); // audioService and dispatch never changes, and can safely be omitted from dependencies
};

export const useSpacebarPlaybackToggle = (
  dispatch: React.Dispatch<WorkstationAction>
) => {
  useKeypress(() => dispatch([TOGGLE_PLAYBACK]), {
    targetKey: ' ',
  });
};

export const usePlaybackControl = (
  isPlaying: boolean,
  transportTime: number
) => {
  const audioService = useAudioService();
  useEffect(() => {
    if (isPlaying) {
      audioService.startPlayback(transportTime);
    } else {
      audioService.pausePlayback(transportTime);
    }
  }, [isPlaying, transportTime]); // audioService never changes, and can safely be omitted from dependencies
};

export const useTotalTime = (
  tracks: Track[],
  dispatch: React.Dispatch<WorkstationAction>
) => {
  const audioService = useAudioService();
  useEffect(() => {
    const totalTime = audioService.getTotalTime();
    dispatch([SET_TOTAL_TIME, totalTime]);
  }, [tracks]); // audioService and dispatch never changes, and can safely be omitted from dependencies
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
      } catch (error) {
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
        projectDispatch([ADD_TRACK, { trackId, fileName: 'New Track' }]);
        audioService.microphone.close();
        msg.success('Recording stopped');
      } catch (error) {
        msg.error('Recording failed');
      }
    };
    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [isRecording]); // audioService and projectDispatch never changes, and can safely be omitted from dependencies
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
