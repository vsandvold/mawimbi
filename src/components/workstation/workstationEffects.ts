import { useEffect, useRef, useState } from 'react';
import {
  usePlaybackService,
  useRecordingService,
  useTrackService,
} from '../../hooks/useAudioService';
import { useContainerHeight } from '../../hooks/useContainerHeight';
import useKeypress from '../../hooks/useKeypress';
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
  const playbackService = usePlaybackService();
  const recordingService = useRecordingService();
  useKeypress(
    () => {
      // Prevent spacebar from toggling playback when the transport is
      // locked by the recording lifecycle (count-in or active recording).
      if (!recordingService.isTransportLocked()) {
        playbackService.togglePlayback();
      }
    },
    { targetKey: ' ' },
  );
};

export const useCountIn = (
  isCountingIn: boolean,
  onComplete: () => void,
): number | null => {
  const playbackService = usePlaybackService();
  const recordingService = useRecordingService();
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
        await recordingService.prepareMicrophone();
      } catch {
        msg.error('Microphone access failed');
        return;
      }

      if (cancelled) {
        recordingService.closeMicrophone();
        return;
      }

      // Limit lead-in playback to what is actually available before the
      // recording position.  When the transport is near the start of the
      // timeline, playing back a full COUNT_IN_DURATION_SEC would overshoot
      // the recording position and cause recording to begin too late.
      const recordingPosition = playbackService.getEngineTime();
      const availableLeadIn = Math.min(
        recordingPosition,
        COUNT_IN_DURATION_SEC,
      );

      recordingService.startCountIn();
      // Block spacebar and show recording UI during count-in
      recordingService.startRecording();

      if (availableLeadIn > 0) {
        playbackService.setEngineTime(recordingPosition - availableLeadIn);

        const playbackDelayMs =
          (COUNT_IN_DURATION_SEC - availableLeadIn) * 1000;

        if (playbackDelayMs > 0) {
          // Delay playback so the transport arrives at the recording
          // position exactly when the count-in ends
          playbackTimerId = setTimeout(() => {
            if (!cancelled) {
              playbackService.play();
            }
          }, playbackDelayMs);
        } else {
          // Full lead-in available — start playback immediately
          playbackService.play();
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
        recordingService.stopCountIn();
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
        recordingService.closeMicrophone();
        recordingService.stopCountIn();
        playbackService.pause();
        recordingService.stopRecording();
      }
    };
    // Service refs are stable across renders
  }, [isCountingIn]); // eslint-disable-line react-hooks/exhaustive-deps

  return currentBeat;
};

export const useTotalTime = (tracks: Track[]) => {
  const playbackService = usePlaybackService();
  const trackService = useTrackService();
  useEffect(() => {
    playbackService.totalTime.value = trackService.getTotalTime();
  }, [tracks, playbackService, trackService]);
};

export const useMicrophone = (isRecording: boolean) => {
  const playbackService = usePlaybackService();
  const recordingService = useRecordingService();
  const trackService = useTrackService();
  const projectDispatch = useProjectDispatch();
  useEffect(() => {
    const msg = message({ key: 'microphone' });

    const startRecording = async () => {
      try {
        await recordingService.startOverdubRecording();
        msg.success('Recording started');
      } catch {
        msg.error('Recording failed');
      }
    };

    const stopRecording = async () => {
      if (!recordingService.isOverdubRecording()) {
        return;
      }
      try {
        const { audioBuffer, arrayBuffer, startTime, latencyCompensation } =
          await recordingService.stopOverdubRecording();
        const { trackId } = trackService.createRecordedTrack(
          audioBuffer,
          arrayBuffer,
          startTime,
          latencyCompensation,
        );
        projectDispatch([
          ADD_TRACK,
          { trackId, fileName: RECORDING_FILE_NAME },
        ]);
        recordingService.stopRecording();
        // Pause at current position so the user can immediately press
        // play to hear the recording in context (standard DAW behavior).
        playbackService.pause();
        playbackService.transportTime.value = playbackService.getEngineTime();
        msg.success('Recording stopped');
      } catch {
        recordingService.stopRecording();
        playbackService.pause();
        msg.error('Recording failed');
      }
    };

    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
    // Service refs are stable across renders
  }, [isRecording]); // eslint-disable-line react-hooks/exhaustive-deps
};

export const useMixerHeight = () => {
  const { containerRef: mixerContainerRef, height: mixerHeight } =
    useContainerHeight();

  return {
    mixerContainerRef,
    mixerHeight,
  };
};
