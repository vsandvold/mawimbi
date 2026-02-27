import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useAudioService } from '../../../hooks/useAudioService';
import useDebounced from '../../../hooks/useDebounced';
import {
  isPlaying,
  isRecording,
  loudness as loudnessSignal,
  stopAndRewindPlayback,
  transportTime,
} from '../../../signals/transportSignals';

type UseScrubberOptions = {
  drawerHeight: number;
  isMixerOpen: boolean;
  pixelsPerSecond: number;
};

// Keep in sync with --timeline-margin in index.css
const TIMELINE_MARGIN = 40;
const SCROLL_DEBOUNCE_MS = 200;

export function useScrubber({
  drawerHeight,
  isMixerOpen,
  pixelsPerSecond,
}: UseScrubberOptions) {
  const playing = isPlaying.value;

  const [isRewindButtonHidden, setIsRewindButtonHidden] = useState(true);

  const toggleRewindButton = (scrollPosition: number) => {
    setIsRewindButtonHidden(scrollPosition < 10);
  };

  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef(false);
  const shouldResumeRef = useRef(false);

  const setScrollPosition = useCallback(
    (time: number) => {
      if (timelineScrollRef.current) {
        const scrollPosition = Math.trunc(time * pixelsPerSecond);
        if (timelineScrollRef.current.scrollLeft !== scrollPosition) {
          isProgrammaticScrollRef.current = true;
          timelineScrollRef.current.scrollLeft = scrollPosition;
        }
        setIsRewindButtonHidden(scrollPosition < 10);
      }
    },
    [pixelsPerSecond],
  );

  const audioService = useAudioService();

  // Animation loop: runs during playback, reads from audio engine, updates DOM directly
  useEffect(() => {
    if (!playing) return;

    let rafId = 0;

    const animate = () => {
      if (!shouldResumeRef.current) {
        const time = audioService.getTransportTime();
        transportTime.value = time;
        setScrollPosition(time);

        const currentLoudness = audioService.mixer.getLoudness();
        loudnessSignal.value = currentLoudness;
        cursorRef.current?.style.setProperty(
          '--loudness',
          String(currentLoudness),
        );

        // Skip end-of-scroll detection while recording — the recording
        // spectrogram grows its container width progressively, so scrollWidth
        // can momentarily equal clientWidth before new content is laid out.
        // Stopping playback here would freeze transportTime updates and halt
        // the live spectrogram scroll.
        if (timelineScrollRef.current && !isRecording.value) {
          const isEndOfScroll =
            timelineScrollRef.current.scrollLeft +
              timelineScrollRef.current.clientWidth >=
            timelineScrollRef.current.scrollWidth;
          if (isEndOfScroll) {
            stopAndRewindPlayback();
            return;
          }
        }
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafId);
  }, [playing, audioService, setScrollPosition]);

  // Sync scroll position to transportTime when not playing (e.g. after rewind)
  useEffect(() => {
    if (!playing) {
      setScrollPosition(transportTime.peek());
    }
  }, [playing, setScrollPosition]);

  const setTransportTimeFromScroll = () => {
    if (timelineScrollRef.current) {
      const scrollPosition = timelineScrollRef.current.scrollLeft;
      const time = scrollPosition / pixelsPerSecond;
      transportTime.value = time;
      audioService.setTransportTime(time);
    }
    if (shouldResumeRef.current) {
      shouldResumeRef.current = false;
      isPlaying.value = true;
    }
  };

  const debouncedSetTransportTime = useDebounced(setTransportTimeFromScroll, {
    timeoutMs: SCROLL_DEBOUNCE_MS,
  });

  const pauseForUserScroll = () => {
    if (playing && !shouldResumeRef.current) {
      shouldResumeRef.current = true;
      isPlaying.value = false;
    }
  };

  const handleWheel = () => {
    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  const handleTouchMove = () => {
    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      return;
    }

    if (timelineScrollRef.current) {
      toggleRewindButton(timelineScrollRef.current.scrollLeft);
    }

    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  const handleStopAndRewind = () => {
    stopAndRewindPlayback();
    setScrollPosition(0);
  };

  const [timelineScaleFactor, setTimelineScaleFactor] = useState(1.0);

  useLayoutEffect(() => {
    if (timelineScrollRef.current) {
      // TODO: or use clientHeight?
      const timelineHeight = timelineScrollRef.current.offsetHeight;
      const scaleFactor = (timelineHeight - drawerHeight) / timelineHeight;
      setTimelineScaleFactor(scaleFactor);
    }
  }, [drawerHeight]);

  const timelineScaleStyle = getTimelineStyle(isMixerOpen, timelineScaleFactor);

  const rewindButtonStyle = getRewindButtonStyle(
    isMixerOpen,
    drawerHeight,
    timelineScaleFactor,
  );

  return {
    timelineScrollRef,
    cursorRef,
    playing,
    isRewindButtonHidden,
    timelineScaleStyle,
    rewindButtonStyle,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleStopAndRewind,
  };
}

const defaultTransformStyle = {
  transformOrigin: 'top left',
  transition: 'transform 0.3s',
  willChange: 'transform',
};

function getTimelineStyle(isMixerOpen: boolean, timelineScaleFactor: number) {
  return isMixerOpen
    ? { ...defaultTransformStyle, transform: `scaleY(${timelineScaleFactor})` }
    : defaultTransformStyle;
}

function getRewindButtonStyle(
  isMixerOpen: boolean,
  drawerHeight: number,
  timelineScaleFactor: number,
) {
  const translateAmount =
    drawerHeight - TIMELINE_MARGIN * (1 - timelineScaleFactor);
  return isMixerOpen
    ? {
        ...defaultTransformStyle,
        transform: `translateY(-${translateAmount}px)`,
      }
    : defaultTransformStyle;
}
