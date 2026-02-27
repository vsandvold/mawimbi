import { useEffect } from 'react';
import { useAudioService } from '../../hooks/useAudioService';
import { useContainerHeight } from '../../hooks/useContainerHeight';
import useKeypress from '../../hooks/useKeypress';
import { TrackSignalStore } from '../../signals/trackSignals';
import {
  isPlaying,
  isRecording as isRecordingSignal,
  togglePlayback,
  totalTime as totalTimeSignal,
  transportTime,
} from '../../signals/transportSignals';
import message from '../message';
import { type Track } from '../../types/track';
import { ADD_TRACK } from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';

const RECORDING_FILE_NAME = 'Recording';

export const useSpacebarPlaybackToggle = () => {
  useKeypress(
    () => {
      // Prevent spacebar from toggling playback during recording,
      // because Transport is controlled by the recording lifecycle.
      if (!isRecordingSignal.value) {
        togglePlayback();
      }
    },
    { targetKey: ' ' },
  );
};

export const useTotalTime = (tracks: Track[]) => {
  const audioService = useAudioService();
  useEffect(() => {
    totalTimeSignal.value = audioService.getTotalTime();
  }, [tracks, audioService]);
};

export const useMicrophone = (isRecording: boolean) => {
  const audioService = useAudioService();
  const projectDispatch = useProjectDispatch();
  useEffect(() => {
    const msg = message({ key: 'microphone' });

    const startRecording = async () => {
      try {
        await audioService.startOverdubRecording();
        isRecordingSignal.value = true;
        isPlaying.value = true;
        msg.success('Recording started');
      } catch {
        msg.error('Recording failed');
      }
    };

    const stopRecording = async () => {
      if (!audioService.isOverdubRecording()) {
        return;
      }
      try {
        const { trackId, initialVolume } =
          await audioService.stopOverdubRecording();
        TrackSignalStore.create(trackId, initialVolume);
        projectDispatch([
          ADD_TRACK,
          { trackId, fileName: RECORDING_FILE_NAME },
        ]);
        isRecordingSignal.value = false;
        isPlaying.value = false;
        transportTime.value = audioService.getTransportTime();
        msg.success('Recording stopped');
      } catch {
        isRecordingSignal.value = false;
        isPlaying.value = false;
        transportTime.value = audioService.getTransportTime();
        msg.error('Recording failed');
      }
    };

    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [isRecording, audioService, projectDispatch]);
};

export const useMixerHeight = () => {
  const { containerRef: mixerContainerRef, height: mixerHeight } =
    useContainerHeight();

  return {
    mixerContainerRef,
    mixerHeight,
  };
};
