import {
  type CSSProperties,
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

// The runway bottom sits at this fraction from the top of the visible area
// (viewport minus drawer). 0.75 = bottom 25% of visible area is empty.
const RUNWAY_BOTTOM_FRACTION = 0.75;
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

  const [containerHeight, setContainerHeight] = useState(0);

  // Track the scroll container height so derived layout values
  // (runway position, extendFactor) update on resize.
  useLayoutEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;

    const update = () => setContainerHeight(el.offsetHeight);
    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // The runway bottom sits at RUNWAY_BOTTOM_FRACTION of the full container.
  // Using the full height (not visible height) keeps the perspective geometry
  // stable when the bottom sheet opens — the 3D transform and scaleY
  // compensation stay constant, preventing the timeline from appearing wider.
  const runwayBottomY = RUNWAY_BOTTOM_FRACTION * containerHeight;

  // Compensate for perspective foreshortening so the far edge (top) fills
  // the viewport. The depth is the distance from the origin to the far edge.
  const extendFactor = computeExtendFactor(runwayBottomY);

  const perspectiveStyle = getPerspectiveStyle(
    runwayBottomY,
    drawerHeight,
    containerHeight,
  );
  const timelineScrollStyle = getTimelineScrollStyle(
    extendFactor,
    runwayBottomY,
  );
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
    perspectiveStyle,
    timelineScrollStyle,
    cursorStyle,
    zoomControlsStyle,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handlePerspectiveWheel,
    syncScrollToTime,
  };
}

// Fallbacks if CSS custom properties are missing or unparseable
const FALLBACK_PERSPECTIVE = 1300;
const FALLBACK_TILT = 80;

const baseTransformStyle = {
  willChange: 'transform',
  transition: 'transform 0.25s ease-out',
};

/**
 * Compensate for perspective foreshortening so the far edge (top) fills
 * the viewport. `runwayBottomY` is the distance from the top of the
 * container to the tilt origin — content above the origin is the visible
 * runway that needs to fill the viewport width after foreshortening.
 */
function computeExtendFactor(runwayBottomY: number): number {
  if (runwayBottomY <= 0) return 1;

  const tiltRad = (FALLBACK_TILT * Math.PI) / 180;
  const depth = runwayBottomY * Math.sin(tiltRad);
  const projectionRatio = FALLBACK_PERSPECTIVE / (FALLBACK_PERSPECTIVE + depth);
  return 1 / projectionRatio;
}

/**
 * Style for the perspective wrapper. Places `perspective-origin` at the
 * runway bottom so the vanishing point matches the tilt pivot.
 *
 * When the drawer is open, `translateY` and `scaleY` reposition and shrink
 * the runway to fit the visible area above the drawer — without touching
 * the child timeline's own 3D transform or styling.
 */
function getPerspectiveStyle(
  runwayBottomY: number,
  drawerHeight: number,
  containerHeight: number,
): CSSProperties {
  const hasDrawer = drawerHeight > 0 && containerHeight > 0;
  const visibleHeight = containerHeight - drawerHeight;
  const scaleY = hasDrawer ? visibleHeight / containerHeight : 1;
  // With the default transform-origin (center), scaleY shifts the top edge
  // downward by half the removed height. translateY compensates so the top
  // stays at the viewport edge.
  const translateY = hasDrawer ? -drawerHeight / 2 : 0;

  return {
    perspectiveOrigin: `center ${runwayBottomY}px`,
    ...(hasDrawer && {
      ...baseTransformStyle,
      transform: `translateY(${translateY}px) scaleY(${scaleY})`,
    }),
  };
}

/**
 * Style for the scroll container. The transform tilts the timeline into a
 * dramatic runway perspective:
 * - rotateX tilts the plane around the runway bottom
 * - scaleY(extendFactor) compensates for perspective foreshortening so the
 *   far edge (top) fills the viewport regardless of screen size
 * - transformOrigin is placed at the runway bottom so the tilt pivots there
 */
function getTimelineScrollStyle(extendFactor: number, runwayBottomY: number) {
  return {
    ...baseTransformStyle,
    transformOrigin: `center ${runwayBottomY}px`,
    transform: `rotateX(var(--timeline-tilt, 0deg)) scaleY(${extendFactor})`,
  };
}

/**
 * Style for the cursor overlay. Passes the drawer height as a CSS variable
 * so the cursor's `top` position resolves against the visible area above
 * the drawer.
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
