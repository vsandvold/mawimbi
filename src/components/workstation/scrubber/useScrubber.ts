import {
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  useAudioService,
  usePlaybackService,
  useRecordingService,
  useTrackService,
} from '../../../hooks/useAudioService';
import useDebounced from '../../../hooks/useDebounced';
import { useTimelineZoom } from '../../../hooks/useTimelineZoom';
import FrequencyVisualizer from '../../../services/FrequencyVisualizer';
import { type Track } from '../../../types/track';
import { type PlasmaPlayheadHandle } from './PlasmaPlayhead';
import { type TrackFrequencyInput } from './plasmaRenderer';

type UseScrubberOptions = {
  drawerHeight: number;
  isMixerOpen: boolean;
  pixelsPerSecond: number;
  tracks: Track[];
};

// Keep in sync with --timeline-margin in index.css
const TIMELINE_MARGIN = 40;
const SCROLL_DEBOUNCE_MS = 200;

export function useScrubber({
  drawerHeight,
  isMixerOpen,
  pixelsPerSecond,
  tracks,
}: UseScrubberOptions) {
  const playbackService = usePlaybackService();
  const recordingService = useRecordingService();
  const trackService = useTrackService();
  const audioService = useAudioService();
  const playing = playbackService.isPlaying.value;

  const [isRewindButtonHidden, setIsRewindButtonHidden] = useState(true);

  const toggleRewindButton = (scrollPosition: number) => {
    setIsRewindButtonHidden(scrollPosition < 10);
  };

  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const cursorContainerRef = useRef<HTMLDivElement>(null);
  const plasmaRef = useRef<PlasmaPlayheadHandle>(null);
  const isProgrammaticScrollRef = useRef(false);
  const shouldResumeRef = useRef(false);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  const { isPinchingRef } = useTimelineZoom(timelineScrollRef);

  // Keep plasma canvas height in sync with the cursor container
  useLayoutEffect(() => {
    const el = cursorContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plasmaRef.current?.resize(entry.contentRect.height);
      }
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

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

  const visualizerRef = useRef<FrequencyVisualizer | null>(null);

  // Create/dispose the FrequencyVisualizer when playback starts/stops.
  // Connected to Tone.getDestination() so it sees the combined master output.
  useEffect(() => {
    if (!playing) return;

    const visualizer = new FrequencyVisualizer(audioService.getDestination());
    visualizerRef.current = visualizer;

    return () => {
      visualizer.dispose();
      visualizerRef.current = null;
    };
  }, [playing, audioService]);

  // Animation loop: runs during playback, reads from audio engine, updates DOM directly
  useEffect(() => {
    if (!playing) return;

    let rafId = 0;

    const animate = () => {
      if (!shouldResumeRef.current) {
        const time = playbackService.getEngineTime();

        // During count-in the transport plays lead-in audio but the
        // timeline stays frozen at the recording position.  Once the
        // count-in ends, scroll and transportTime resume updating.
        if (!recordingService.isCountingIn.value) {
          playbackService.transportTime.value = time;
          setScrollPosition(time);
        }

        const currentLoudness = trackService.mixer.getLoudness();
        playbackService.loudness.value = currentLoudness;

        const frequencyData =
          visualizerRef.current?.getVisualizationData() ?? null;
        const trackFrequencyInputs: TrackFrequencyInput[] =
          tracksRef.current.map((track) => {
            const color = track.color ?? { r: 100, g: 200, b: 255 };
            return { r: color.r, g: color.g, b: color.b, data: frequencyData };
          });
        const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0;
        plasmaRef.current?.render(
          frequencyData,
          currentLoudness,
          scrollLeft,
          trackFrequencyInputs,
        );

        // Skip end-of-scroll detection while recording — the recording
        // spectrogram grows its container width progressively, so scrollWidth
        // can momentarily equal clientWidth before new content is laid out.
        // Stopping playback here would freeze transportTime updates and halt
        // the live spectrogram scroll.
        if (
          timelineScrollRef.current &&
          !recordingService.isActivelyRecording()
        ) {
          const isEndOfScroll =
            timelineScrollRef.current.scrollLeft +
              timelineScrollRef.current.clientWidth >=
            timelineScrollRef.current.scrollWidth;
          if (isEndOfScroll) {
            playbackService.rewind();
            return;
          }
        }
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafId);
    // playbackService, recordingService, trackService are stable refs
  }, [playing, setScrollPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync scroll position to transportTime when not playing (e.g. after rewind)
  // and render the idle (static line) playhead frame
  useEffect(() => {
    if (!playing) {
      setScrollPosition(playbackService.transportTime.peek());
      plasmaRef.current?.renderIdle();
    }
    // playbackService is a stable ref
  }, [playing, setScrollPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTransportTimeFromScroll = () => {
    if (timelineScrollRef.current) {
      const scrollPosition = timelineScrollRef.current.scrollLeft;
      const time = scrollPosition / pixelsPerSecond;
      playbackService.seekTo(time);
    }
    if (shouldResumeRef.current) {
      shouldResumeRef.current = false;
      playbackService.play();
    }
  };

  const debouncedSetTransportTime = useDebounced(setTransportTimeFromScroll, {
    timeoutMs: SCROLL_DEBOUNCE_MS,
  });

  const pauseForUserScroll = () => {
    if (playing && !shouldResumeRef.current) {
      shouldResumeRef.current = true;
      playbackService.pause();
    }
  };

  const handleWheel = (e: ReactWheelEvent) => {
    // Skip scroll handling when Ctrl/Meta+wheel is used for zoom
    if (e.ctrlKey || e.metaKey) return;
    if (recordingService.isActivelyRecording()) return;
    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  const handleTouchMove = () => {
    // Skip scroll handling during pinch-to-zoom
    if (isPinchingRef.current) return;
    if (recordingService.isActivelyRecording()) return;
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

    if (recordingService.isActivelyRecording()) return;
    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  const handleStopAndRewind = () => {
    if (recordingService.isActivelyRecording()) return;
    playbackService.rewind();
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
    cursorContainerRef,
    plasmaRef,
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
