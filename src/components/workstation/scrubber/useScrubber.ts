import {
  type CSSProperties,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
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

const TIMELINE_SCALE_Y = 20;
const TIMELINE_TRANSLATE_Y_PX = 50;
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
        const maxScrollTop = el.scrollHeight - el.clientHeight;
        const scrollPosition =
          maxScrollTop - Math.trunc(time * pixelsPerSecond);
        if (el.scrollTop !== scrollPosition) {
          isProgrammaticScrollRef.current = true;
          el.scrollTop = scrollPosition;
        }
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
        // In inverted scroll, end of track is at scrollTop=0 (top of scroll area)
        if (timelineScrollRef.current && !recording.isActivelyRecording) {
          const isEndOfScroll = timelineScrollRef.current.scrollTop <= 0;
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
      const maxScrollTop = el.scrollHeight - el.clientHeight;
      const time = (maxScrollTop - el.scrollTop) / pixelsPerSecond;
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

  // The perspective wrapper covers the full rectangular area while the
  // tilted scroll container has a trapezoidal hit-test shape. Wheel events
  // landing in the dead-zone corners hit the wrapper instead of the scroll
  // container. This handler forwards them as programmatic scrolls so the
  // entire visible area is scrollable.
  const handlePerspectiveWheel = (e: ReactWheelEvent) => {
    const el = timelineScrollRef.current;
    if (!el) return;
    // Skip events that already reached the scroll container (they bubble up)
    if (el.contains(e.target as Node)) return;
    // Skip zoom gestures
    if (e.ctrlKey || e.metaKey) return;

    el.scrollTop += e.deltaY;
    handleWheel(e);
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

    if (recording.isActivelyRecording) return;
    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  const timelineScrollStyle = getTimelineScrollStyle();
  const timelineOverlayStyle = getTimelineOverlayStyle(drawerHeight);
  const cursorStyle = getCursorStyle(drawerHeight);

  const zoomControlsStyle = getZoomControlsStyle(drawerHeight);

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
    timelineScrollStyle,
    timelineOverlayStyle,
    cursorStyle,
    zoomControlsStyle,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handlePerspectiveWheel,
    syncScrollToTime,
  };
}

const baseTransformStyle = {
  willChange: 'transform',
  transition: 'transform 0.25s ease-out',
};

/**
 * Style for the scroll container. The transform tilts the timeline into a
 * dramatic runway perspective:
 * - rotateX tilts the plane around the bottom edge
 * - scaleY stretches height so the foreshortened far edge fills the viewport
 * - translateY shifts the near edge downward (combined with CSS margin-bottom
 *   to push the bottom outside the viewport for full immersion)
 */
function getTimelineScrollStyle() {
  return {
    ...baseTransformStyle,
    transformOrigin: 'center bottom',
    transform: `rotateX(var(--timeline-tilt, 0deg)) scaleY(${TIMELINE_SCALE_Y}) translateY(${TIMELINE_TRANSLATE_Y_PX}px)`,
  };
}

/**
 * Style for the shade overlay. Uses direct `bottom` positioning so the
 * gradient covers exactly the visible area above the drawer. This replaces
 * the previous scaleY approach which drifted when the viewport height
 * changed (e.g. mobile address bar show/hide).
 */
function getTimelineOverlayStyle(drawerHeight: number): CSSProperties {
  return {
    bottom: `${drawerHeight}px`,
  };
}

/**
 * Style for the cursor overlay. Passes the drawer height as a CSS variable
 * so the cursor's `top` position resolves against the visible area above
 * the drawer. This replaces the previous scaleY approach.
 */
function getCursorStyle(drawerHeight: number): CSSProperties {
  return {
    '--drawer-height': `${drawerHeight}px`,
  } as React.CSSProperties;
}

function getZoomControlsStyle(drawerHeight: number) {
  // Offset the zoom controls upward so they sit above the drawer.
  return {
    ...baseTransformStyle,
    transform: `translateY(-${drawerHeight}px)`,
  };
}
