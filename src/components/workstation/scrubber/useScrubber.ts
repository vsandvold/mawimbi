import {
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useAudioService } from '../../../hooks/useAudioService';
import { usePlaybackService } from '../../../hooks/usePlaybackService';
import { useRecordingService } from '../../../hooks/useRecordingService';
import { useTrackService } from '../../../hooks/useTrackService';
import useDebounced from '../../../hooks/useDebounced';
import { useTimelineZoom } from '../../../hooks/useTimelineZoom';
import FrequencyVisualizer from '../../../services/FrequencyVisualizer';
import { type PlasmaPlayheadHandle } from './PlasmaPlayhead';

type UseScrubberOptions = {
  drawerHeight: number;
  pixelsPerSecond: number;
};

// Keep in sync with --timeline-margin-bottom in index.css
const TIMELINE_MARGIN_BOTTOM = 40;
const SCROLL_DEBOUNCE_MS = 200;

export function useScrubber({
  drawerHeight,
  pixelsPerSecond,
}: UseScrubberOptions) {
  const playback = usePlaybackService();
  const recording = useRecordingService();
  const trackHook = useTrackService();
  const audioService = useAudioService();
  const playing = playback.isPlaying;

  const [isRewindButtonHidden, setIsRewindButtonHidden] = useState(true);

  const isNearBeginning = (el: HTMLDivElement) => {
    return el.scrollTop < 10;
  };

  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const cursorContainerRef = useRef<HTMLDivElement>(null);
  const plasmaRef = useRef<PlasmaPlayheadHandle>(null);
  const isProgrammaticScrollRef = useRef(false);
  const shouldResumeRef = useRef(false);
  const { isPinchingRef } = useTimelineZoom(timelineScrollRef);

  // Keep plasma canvas width in sync with the cursor container
  useLayoutEffect(() => {
    const el = cursorContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plasmaRef.current?.resize(entry.contentRect.width);
        // Redraw the idle playhead after the canvas width changes.
        // The initial renderIdle() call in the playing-sync effect fires
        // before the ResizeObserver has set the canvas width, so the
        // first frame is drawn into a zero-width canvas.  Re-rendering
        // here ensures the playhead is visible as soon as layout resolves.
        // During playback the animation loop immediately overwrites this.
        plasmaRef.current?.renderIdle();
      }
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const setScrollPosition = useCallback(
    (time: number) => {
      const el = timelineScrollRef.current;
      if (el) {
        const scrollPosition = Math.trunc(time * pixelsPerSecond);
        if (el.scrollTop !== scrollPosition) {
          isProgrammaticScrollRef.current = true;
          el.scrollTop = scrollPosition;
        }
        setIsRewindButtonHidden(isNearBeginning(el));
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
        const time = playback.getEngineTime();

        // During count-in the transport plays lead-in audio but the
        // timeline stays frozen at the recording position.  Once the
        // count-in ends, scroll and transportTime resume updating.
        if (!recording.isCountingIn) {
          playback.setTransportTime(time);
          setScrollPosition(time);
        }

        const currentLoudness = trackHook.getLoudness();
        playback.setLoudness(currentLoudness);

        const frequencyData =
          visualizerRef.current?.getVisualizationData() ?? null;
        plasmaRef.current?.render(frequencyData, currentLoudness);

        // Skip end-of-scroll detection while recording — the recording
        // spectrogram grows its container height progressively, so scrollHeight
        // can momentarily equal clientHeight before new content is laid out.
        // Stopping playback here would freeze transportTime updates and halt
        // the live spectrogram scroll.
        if (timelineScrollRef.current && !recording.isActivelyRecording) {
          const el = timelineScrollRef.current;
          const maxScrollTop = el.scrollHeight - el.clientHeight;
          const isEndOfScroll = el.scrollTop >= maxScrollTop;
          if (isEndOfScroll) {
            playback.rewind();
            return;
          }
        }
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafId);
    // Hook objects reference stable service singletons via getters
  }, [playing, setScrollPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync scroll position to transportTime when not playing (e.g. after rewind)
  // and render the idle (static line) playhead frame
  useEffect(() => {
    if (!playing) {
      setScrollPosition(playback.transportTime);
      plasmaRef.current?.renderIdle();
    }
    // Hook objects reference stable service singletons via getters
  }, [playing, setScrollPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTransportTimeFromScroll = () => {
    const el = timelineScrollRef.current;
    if (el) {
      const time = el.scrollTop / pixelsPerSecond;
      playback.seekTo(time);
    }
    if (shouldResumeRef.current) {
      shouldResumeRef.current = false;
      playback.play();
    }
  };

  const debouncedSetTransportTime = useDebounced(setTransportTimeFromScroll, {
    timeoutMs: SCROLL_DEBOUNCE_MS,
  });

  const pauseForUserScroll = () => {
    if (playing && !shouldResumeRef.current) {
      shouldResumeRef.current = true;
      playback.pause();
    }
  };

  const handleWheel = (e: ReactWheelEvent) => {
    // Skip scroll handling when Ctrl/Meta+wheel is used for zoom
    if (e.ctrlKey || e.metaKey) return;
    if (recording.isActivelyRecording) return;
    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  const handleTouchMove = () => {
    // Skip scroll handling during pinch-to-zoom
    if (isPinchingRef.current) return;
    if (recording.isActivelyRecording) return;
    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      return;
    }

    if (timelineScrollRef.current) {
      setIsRewindButtonHidden(isNearBeginning(timelineScrollRef.current));
    }

    if (recording.isActivelyRecording) return;
    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  const handleStopAndRewind = () => {
    if (recording.isActivelyRecording) return;
    playback.rewind();
    setScrollPosition(0);
  };

  const [timelineScaleFactor, setTimelineScaleFactor] = useState(1.0);

  // Recalculate the scale factor when the timeline container resizes (e.g.
  // entering/exiting fullscreen) or when the drawer height changes.
  useLayoutEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;

    const updateScaleFactor = () => {
      const timelineHeight = el.offsetHeight;
      if (timelineHeight > 0) {
        const scaleFactor = (timelineHeight - drawerHeight) / timelineHeight;
        setTimelineScaleFactor(scaleFactor);
      }
    };

    updateScaleFactor();

    const observer = new ResizeObserver(() => {
      updateScaleFactor();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [drawerHeight]);

  const timelineScrollStyle = getTimelineScrollStyle(timelineScaleFactor);
  const timelineOverlayStyle = getTimelineOverlayStyle(timelineScaleFactor);

  const rewindButtonStyle = getRewindButtonStyle(
    drawerHeight,
    timelineScaleFactor,
  );

  const syncScrollToTime = useCallback(
    (time: number) => {
      setScrollPosition(time);
      plasmaRef.current?.renderIdle();
    },
    [setScrollPosition],
  );

  return {
    timelineScrollRef,
    cursorContainerRef,
    plasmaRef,
    isRewindButtonHidden,
    timelineScrollStyle,
    timelineOverlayStyle,
    rewindButtonStyle,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleStopAndRewind,
    syncScrollToTime,
  };
}

const baseTransformStyle = {
  transformOrigin: 'top left',
  willChange: 'transform',
  transition: 'transform 0.25s ease-out',
};

/**
 * Style for the scroll container: flips content vertically via scaleY(-1)
 * so that top-down DOM content appears bottom-up visually (time=0 at bottom).
 * The translateY(-100%) compensates for the flip with transformOrigin: top left.
 * The rotateX tilt creates a perspective depth effect — applied before the flip
 * so that near-time content (visual bottom) tilts towards the viewer.
 */
function getTimelineScrollStyle(timelineScaleFactor: number) {
  return {
    ...baseTransformStyle,
    transform: `rotateX(var(--timeline-tilt, 0deg)) scaleY(${-timelineScaleFactor}) translateY(-100%)`,
  };
}

/**
 * Style for overlay elements (shade, cursor) that should NOT be flipped.
 * Only applies the drawer scaling.
 */
function getTimelineOverlayStyle(timelineScaleFactor: number) {
  return {
    ...baseTransformStyle,
    transform: `scaleY(${timelineScaleFactor})`,
  };
}

function getRewindButtonStyle(
  drawerHeight: number,
  timelineScaleFactor: number,
) {
  const translateAmount =
    drawerHeight - TIMELINE_MARGIN_BOTTOM * (1 - timelineScaleFactor);
  return {
    ...baseTransformStyle,
    transform: `translateY(-${translateAmount}px)`,
  };
}
