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
    let playbackTimerId: ReturnType<typeof setTimeout> | null = null;

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

      // Limit lead-in playback to what is actually available before the
      // recording position.  When the transport is near the start of the
      // timeline, playing back a full COUNT_IN_DURATION_SEC would overshoot
      // the recording position and cause recording to begin too late.
      const recordingPosition = audioService.getTransportTime();
      const availableLeadIn = Math.min(
        recordingPosition,
        COUNT_IN_DURATION_SEC,
      );

      isCountingInSignal.value = true;
      // Block spacebar and show recording UI during count-in
      isRecordingSignal.value = true;

      if (availableLeadIn > 0) {
        audioService.setTransportTime(recordingPosition - availableLeadIn);

        const playbackDelayMs =
          (COUNT_IN_DURATION_SEC - availableLeadIn) * 1000;

        if (playbackDelayMs > 0) {
          // Delay playback so the transport arrives at the recording
          // position exactly when the count-in ends
          playbackTimerId = setTimeout(() => {
            if (!cancelled) {
              isPlaying.value = true;
            }
          }, playbackDelayMs);
        } else {
          // Full lead-in available — start playback immediately
          isPlaying.value = true;
        }
      }

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

      if (playbackTimerId !== null) {
        clearTimeout(playbackTimerId);
      }

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
