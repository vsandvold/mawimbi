import { useEffect, useRef, useState } from 'react';
import { useClassificationService } from '../../hooks/useClassificationService';
import { usePlaybackService } from '../../hooks/usePlaybackService';
import { useRecordingService } from '../../hooks/useRecordingService';
import { useTrackService } from '../../hooks/useTrackService';
import { useContainerHeight } from '../../hooks/useContainerHeight';
import useKeypress from '../../hooks/useKeypress';
import { saveAudioData } from '../../services/ProjectStorageService';
import useMessage from '../message';
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
  const playback = usePlaybackService();
  const recording = useRecordingService();
  useKeypress(
    () => {
      // Prevent spacebar from toggling playback when the transport is
      // locked by the recording lifecycle (count-in or active recording).
      if (!recording.isTransportLocked) {
        playback.togglePlayback();
      }
    },
    { targetKey: ' ' },
  );
};

export const useCountIn = (
  isCountingIn: boolean,
  onComplete: () => void,
): number | null => {
  const playback = usePlaybackService();
  const recording = useRecordingService();
  const message = useMessage();
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
        await recording.prepareMicrophone();
      } catch {
        msg.error('Microphone access failed');
        return;
      }

      if (cancelled) {
        recording.closeMicrophone();
        return;
      }

      // Limit lead-in playback to what is actually available before the
      // recording position.  When the transport is near the start of the
      // timeline, playing back a full COUNT_IN_DURATION_SEC would overshoot
      // the recording position and cause recording to begin too late.
      const recordingPosition = playback.getEngineTime();
      const availableLeadIn = Math.min(
        recordingPosition,
        COUNT_IN_DURATION_SEC,
      );

      recording.startCountIn();
      // Block spacebar and show recording UI during count-in
      recording.startRecording();

      if (availableLeadIn > 0) {
        playback.setEngineTime(recordingPosition - availableLeadIn);

        const playbackDelayMs =
          (COUNT_IN_DURATION_SEC - availableLeadIn) * 1000;

        if (playbackDelayMs > 0) {
          // Delay playback so the transport arrives at the recording
          // position exactly when the count-in ends
          playbackTimerId = setTimeout(() => {
            if (!cancelled) {
              playback.play();
            }
          }, playbackDelayMs);
        } else {
          // Full lead-in available — start playback immediately
          playback.play();
        }
      }
      // When availableLeadIn is 0 (recording from position 0), playback
      // is NOT started here.  useMicrophone calls playback.play() after
      // startOverdubRecording() so the scrubber animation loop activates
      // without advancing the transport before the recording start time
      // is captured.

      for (let i = 1; i <= COUNT_IN_TOTAL_BEATS; i++) {
        if (cancelled) break;
        setCurrentBeat(i);
        await new Promise((resolve) =>
          setTimeout(resolve, COUNT_IN_BEAT_INTERVAL),
        );
      }

      if (!cancelled) {
        completedRef.current = true;
        recording.stopCountIn();
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
        recording.closeMicrophone();
        recording.stopCountIn();
        playback.pause();
        recording.stopRecording();
      }
    };
    // Hook objects reference stable service singletons via getters
  }, [isCountingIn]); // eslint-disable-line react-hooks/exhaustive-deps

  return currentBeat;
};

export const useTotalTime = (tracks: Track[]) => {
  const playback = usePlaybackService();
  const trackHook = useTrackService();
  useEffect(() => {
    playback.setTotalTime(trackHook.getTotalTime());
    // Hook objects reference stable service singletons via getters
  }, [tracks]); // eslint-disable-line react-hooks/exhaustive-deps
};

export const useClassificationMessages = (tracks: Track[]) => {
  const classification = useClassificationService();
  const message = useMessage();
  const reportedRef = useRef(new Set<string>());

  useEffect(() => {
    const msg = message({ key: 'classification' });

    for (const track of tracks) {
      const state = classification.getClassificationState(track.trackId);
      const trackKey = `${track.trackId}:${state}`;

      if (reportedRef.current.has(trackKey)) continue;

      if (state === 'classifying') {
        reportedRef.current.add(trackKey);
        msg.loading('Detecting instrument…');
      } else if (state === 'done') {
        reportedRef.current.add(trackKey);
        const label = classification.getClassification(track.trackId)?.label;
        msg.success(`Detected instrument: ${label}`);
      } else if (state === 'error') {
        reportedRef.current.add(trackKey);
        msg.error('Instrument detection failed');
      }
    }
  });
};

export const useMicrophone = (isRecording: boolean) => {
  const playback = usePlaybackService();
  const recording = useRecordingService();
  const trackHook = useTrackService();
  const projectDispatch = useProjectDispatch();
  const message = useMessage();
  useEffect(() => {
    const msg = message({ key: 'microphone' });

    const startRecording = async () => {
      try {
        await recording.startOverdubRecording();
        // Ensure the playback state machine transitions to 'playing' so
        // the scrubber animation loop starts.  When recording from
        // position 0, useCountIn does not call play() (no lead-in), so
        // this is the first play() call.  When lead-in was available,
        // play() was already called and this is a no-op.
        playback.play();
        msg.success('Recording started');
      } catch {
        msg.error('Recording failed');
      }
    };

    const stopRecording = async () => {
      if (!recording.isOverdubRecording()) {
        return;
      }
      try {
        const { audioBuffer, arrayBuffer, startTime } =
          await recording.stopOverdubRecording();
        const { trackId } = trackHook.createRecordedTrack(
          audioBuffer,
          arrayBuffer,
          startTime,
        );
        saveAudioData(trackId, arrayBuffer);
        projectDispatch([
          ADD_TRACK,
          { trackId, fileName: RECORDING_FILE_NAME, startTime },
        ]);
        recording.stopRecording();
        // Pause at current position so the user can immediately press
        // play to hear the recording in context (standard DAW behavior).
        playback.pause();
        playback.setTransportTime(playback.getEngineTime());
        msg.success('Recording stopped');
      } catch {
        recording.stopRecording();
        playback.pause();
        msg.error('Recording failed');
      }
    };

    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
    // Hook objects reference stable service singletons via getters
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
