import { useEffect, useRef, useState } from 'react';
import { useAudioService } from '../../hooks/useAudioService';
import { useContainerHeight } from '../../hooks/useContainerHeight';
import useKeypress from '../../hooks/useKeypress';
import { TrackSignalStore } from '../../signals/trackSignals';
import {
  isCountingIn as isCountingInSignal,
  isPlaying,
  isRecording as isRecordingSignal,
  stopAndRewindPlayback,
  togglePlayback,
  totalTime as totalTimeSignal,
} from '../../signals/transportSignals';
import message from '../message';
import { type Track } from '../../types/track';
import { ADD_TRACK } from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';

const RECORDING_FILE_NAME = 'Recording';

// ~120 BPM: 500ms per beat
const COUNT_IN_BEAT_INTERVAL = 500;
const COUNT_IN_TOTAL_BEATS = 4;
const COUNT_IN_DURATION_SEC =
  (COUNT_IN_TOTAL_BEATS * COUNT_IN_BEAT_INTERVAL) / 1000;

export const useSpacebarPlaybackToggle = () => {
  useKeypress(
    () => {
      // Prevent spacebar from toggling playback during recording
      // or count-in, because Transport is controlled by the
      // recording lifecycle.
      if (!isRecordingSignal.value) {
        togglePlayback();
      }
    },
    { targetKey: ' ' },
  );
};

export const useCountIn = (
  isCountingIn: boolean,
  onComplete: () => void,
): number | null => {
  const audioService = useAudioService();
  const [currentBeat, setCurrentBeat] = useState<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!isCountingIn) {
      setCurrentBeat(null);
      return;
    }

    completedRef.current = false;
    let cancelled = false;

    const run = async () => {
      const msg = message({ key: 'microphone' });

      try {
        await audioService.prepareMicrophone();
      } catch {
        msg.error('Microphone access failed');
        return;
      }

      if (cancelled) {
        audioService.closeMicrophone();
        return;
      }

      // Seek transport back so existing tracks play as lead-in during
      // the count-in. After the 4-beat sequence (~2 s) the transport
      // arrives at the original position where recording begins.
      const seekBackTime = Math.max(
        0,
        audioService.getTransportTime() - COUNT_IN_DURATION_SEC,
      );
      audioService.setTransportTime(seekBackTime);

      // Start playback of existing tracks during count-in
      isCountingInSignal.value = true;
      isPlaying.value = true;
      // Block spacebar and show recording UI during count-in
      isRecordingSignal.value = true;

      for (let i = 1; i <= COUNT_IN_TOTAL_BEATS; i++) {
        if (cancelled) break;
        setCurrentBeat(i);
        await new Promise((resolve) =>
          setTimeout(resolve, COUNT_IN_BEAT_INTERVAL),
        );
      }

      if (!cancelled) {
        completedRef.current = true;
        isCountingInSignal.value = false;
        setCurrentBeat(null);
        onComplete();
      }
    };

    run();

    return () => {
      cancelled = true;
      setCurrentBeat(null);

      if (!completedRef.current) {
        // Cancelled by user — clean up microphone and playback
        audioService.closeMicrophone();
        isCountingInSignal.value = false;
        isPlaying.value = false;
        isRecordingSignal.value = false;
      }
    };
    // audioService and onComplete are stable refs
  }, [isCountingIn]); // eslint-disable-line react-hooks/exhaustive-deps

  return currentBeat;
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
        stopAndRewindPlayback();
        msg.success('Recording stopped');
      } catch {
        isRecordingSignal.value = false;
        stopAndRewindPlayback();
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
