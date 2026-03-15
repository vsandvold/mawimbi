import {
  type RefObject,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useAudioService } from '../../audio/useAudioService';
import { usePlaybackService } from '../../playback/usePlaybackService';
import { useRecordingService } from '../../recording/useRecordingService';
import { useTrackService } from '../../tracks/useTrackService';
import useDebounced from '../../../shared/hooks/useDebounced';
import { useTimelineZoom } from '../../../shared/hooks/useTimelineZoom';
import FrequencyVisualizer from '../../spectrogram/FrequencyVisualizer';
import { type PlayheadHandle } from './Playhead';

const SCROLL_DEBOUNCE_MS = 200;

type UseScrubberScrollOptions = {
  scrollRef: RefObject<HTMLDivElement | null>;
  playheadRef: RefObject<PlayheadHandle | null>;
  pixelsPerSecond: number;
};

/**
 * Manages scroll-to-time synchronization, the playback animation loop,
 * and scroll event handlers for the scrubber.
 *
 * During playback, an animation loop reads the audio engine time and
 * updates both the scroll position and playhead visualization each frame.
 * When the user scrolls manually, playback pauses and resumes after a
 * debounced seek.
 */
export function useScrubberScroll({
  scrollRef,
  playheadRef,
  pixelsPerSecond,
}: UseScrubberScrollOptions) {
  const playback = usePlaybackService();
  const recording = useRecordingService();
  const trackHook = useTrackService();
  const audioService = useAudioService();
  const playing = playback.isPlaying;

  const isProgrammaticScrollRef = useRef(false);
  const shouldResumeRef = useRef(false);
  const { isPinchingRef } = useTimelineZoom(scrollRef);

  const setScrollPosition = useCallback(
    (time: number) => {
      const el = scrollRef.current;
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
    [pixelsPerSecond, scrollRef],
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
        playheadRef.current?.render(frequencyData, currentLoudness);

        // Skip end-of-scroll detection while recording — the recording
        // spectrogram grows its container height progressively, so scrollHeight
        // can momentarily equal clientHeight before new content is laid out.
        // Stopping playback here would freeze transportTime updates and halt
        // the live spectrogram scroll.
        // In inverted scroll, end of track is at scrollTop=0 (top of scroll area)
        if (scrollRef.current && !recording.isActivelyRecording) {
          const isEndOfScroll = scrollRef.current.scrollTop <= 0;
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
      playheadRef.current?.renderIdle();
    }
    // Hook objects reference stable service singletons via getters
  }, [playing, setScrollPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTransportTimeFromScroll = () => {
    const el = scrollRef.current;
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
  const handleViewportWheel = (e: ReactWheelEvent) => {
    const el = scrollRef.current;
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

  const syncScrollToTime = useCallback(
    (time: number) => {
      setScrollPosition(time);
      playheadRef.current?.renderIdle();
    },
    [setScrollPosition, playheadRef],
  );

  return {
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleViewportWheel,
    syncScrollToTime,
  };
}
