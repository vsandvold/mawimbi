import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useAudioService } from '../../audio/useAudioService';
import { usePlaybackService } from '../../playback/usePlaybackService';
import { useRecordingService } from '../../recording/useRecordingService';
import { useTrackService } from '../../tracks/useTrackService';
import useDebounced from '../../../shared/hooks/useDebounced';
import FrequencyVisualizer from '../../spectrogram/FrequencyVisualizer';
import { type PlayheadHandle } from './Playhead';
import {
  isGestureInProgress,
  nextScrubState,
  type ScrubState,
} from './scrubGesture';

const SCROLL_DEBOUNCE_MS = 200;

type PointerPosition = { x: number; y: number };

type UseScrubberScrollOptions = {
  phantomRef: RefObject<HTMLDivElement | null>;
  offsetRef: RefObject<HTMLDivElement | null>;
  playheadRef: RefObject<PlayheadHandle | null>;
  pixelsPerSecond: number;
};

/**
 * Manages scroll-to-time synchronization, the playback animation loop,
 * and scroll event handlers for the scrubber.
 *
 * Scroll interactions are captured by the PhantomScroller (an invisible,
 * untransformed overlay with native scroll physics) — the only scroll
 * container in the scrubber. Its scroll position is applied to the offset
 * stage inside the tilt as a translateY, never as scrollTop: a scroll
 * container inside the tilted plane would clip the runway in pre-transform
 * space (mawimbi#459) and clamp its range short of the phantom's whenever
 * the drawer is open (mawimbi#450).
 *
 * During playback, an animation loop reads the audio engine time and
 * updates the phantom scroll position and offset transform each frame.
 * When the user scrolls manually, playback pauses and resumes after a
 * debounced seek.
 */
export function useScrubberScroll({
  phantomRef,
  offsetRef,
  playheadRef,
  pixelsPerSecond,
}: UseScrubberScrollOptions) {
  const playback = usePlaybackService();
  const recording = useRecordingService();
  const trackHook = useTrackService();
  const audioService = useAudioService();
  const playing = playback.isPlaying;
  const playbackState = playback.playbackState;

  const scrubStateRef = useRef<ScrubState>('idle');
  const shouldResumeRef = useRef(false);
  const pointerDownPosRef = useRef<PointerPosition | null>(null);

  /**
   * Ensure the phantom scroller's spacer height matches the offset stage's
   * content height. This must happen synchronously before setting scrollTop
   * so the phantom has the correct scrollable range. React state updates
   * for spacer height may lag behind DOM mutations (e.g. recording
   * spectrogram growth), so we patch the spacer directly.
   */
  const syncSpacerHeight = useCallback(() => {
    const phantom = phantomRef.current;
    const offset = offsetRef.current;
    if (!phantom || !offset) return;

    const spacer = phantom.firstElementChild as HTMLElement | null;
    const contentHeight = offset.offsetHeight;
    if (spacer && spacer.offsetHeight !== contentHeight) {
      spacer.style.height = `${contentHeight}px`;
    }
  }, [phantomRef, offsetRef]);

  /** Apply the phantom's scroll position to the offset stage's transform. */
  const syncOffset = useCallback(() => {
    const phantom = phantomRef.current;
    const offset = offsetRef.current;
    if (phantom && offset) {
      offset.style.transform = `translate3d(0, ${-phantom.scrollTop}px, 0)`;
    }
  }, [phantomRef, offsetRef]);

  const setScrollPosition = useCallback(
    (time: number) => {
      const phantom = phantomRef.current;
      if (phantom) {
        syncSpacerHeight();
        const maxScrollTop = phantom.scrollHeight - phantom.clientHeight;
        const scrollPosition =
          maxScrollTop - Math.trunc(time * pixelsPerSecond);
        if (phantom.scrollTop !== scrollPosition) {
          phantom.scrollTop = scrollPosition;
        }
        syncOffset();
      }
    },
    [pixelsPerSecond, phantomRef, syncSpacerHeight, syncOffset],
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
        // In inverted scroll, end of track is at scrollTop=0 (top of scroll area).
        // This is a safety net for the primary end-of-timeline detection
        // above (setTransportTime's isAtEndOfTimeline check): if that
        // already stopped playback this frame, isPlaying is false here and
        // this block is skipped. If it hasn't (a rare rounding disagreement
        // between the scroll-position and transport-time math), route
        // through the same setTransportTime path so both mechanisms agree
        // on "stop at end, preserving position" — not rewind()'s
        // reset-to-0, which would contradict it (spec 002, Open questions).
        if (
          phantomRef.current &&
          !recording.isActivelyRecording &&
          playback.isPlaying
        ) {
          const isEndOfScroll = phantomRef.current.scrollTop <= 0;
          if (isEndOfScroll) {
            playback.setTransportTime(playback.totalTime);
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
  // and render the idle (static line) playhead frame.
  // Depends on playbackState (not just isPlaying) so the effect fires on
  // paused→stopped transitions — e.g. when rewind is pressed while paused.
  useEffect(() => {
    if (!playing) {
      setScrollPosition(playback.transportTime);
      playheadRef.current?.renderIdle();
    }
    // Hook objects reference stable service singletons via getters
  }, [playbackState, setScrollPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTransportTimeFromScroll = () => {
    scrubStateRef.current = nextScrubState(scrubStateRef.current, {
      type: 'seekCommitted',
    });
    const el = phantomRef.current;
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

  // A gesture is entered only from real input events (below), never
  // inferred from `scroll` events — see scrubGesture.ts. Recording position
  // is tracked so a subsequent pointermove can measure cumulative movement
  // against it (G4: a resting finger never scrubs).
  const handlePointerDown = (e: React.PointerEvent) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const origin = pointerDownPosRef.current;
    if (!origin || recording.isActivelyRecording) return;

    const distancePx = Math.hypot(e.clientX - origin.x, e.clientY - origin.y);
    const wasIdle = scrubStateRef.current === 'idle';
    scrubStateRef.current = nextScrubState(scrubStateRef.current, {
      type: 'pointerMove',
      distancePx,
    });
    if (wasIdle && scrubStateRef.current !== 'idle') {
      pauseForUserScroll();
    }
  };

  // Pointer released, cancelled, or lost capture — every route a native
  // touch scroll can end through (mawimbi#472's stutter loop traced to
  // PhantomScroller only handling pointerup, leaving a stuck pointer-down
  // flag when the browser took over the gesture and fired pointercancel
  // instead). The gesture may still be settling (momentum scroll events
  // extending the debounce), so this only ends the *pointer*, not the
  // gesture — pendingSeek is exited by the debounced seek committing.
  const handlePointerEnd = () => {
    pointerDownPosRef.current = null;
    scrubStateRef.current = nextScrubState(scrubStateRef.current, {
      type: 'pointerEnd',
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Ctrl/Meta+wheel is zoom, not scroll
    if (e.ctrlKey || e.metaKey) return;
    if (recording.isActivelyRecording) return;
    scrubStateRef.current = nextScrubState(scrubStateRef.current, {
      type: 'wheel',
    });
    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  // `scroll` events never drive a gesture transition themselves (that's the
  // fix: the loop's own scrollTop writes reach this handler too, and
  // inferring intent from them is exactly what misclassified them as user
  // scrubs). They only sync visuals, and — while a gesture is already
  // active or settling — extend the seek debounce, which is what keeps
  // touch momentum seeking working after the finger lifts.
  const handleScroll = () => {
    syncSpacerHeight();
    syncOffset();

    if (!isGestureInProgress(scrubStateRef.current)) return;
    if (recording.isActivelyRecording) return;
    debouncedSetTransportTime();
  };

  const syncScrollToTime = useCallback(
    (time: number) => {
      setScrollPosition(time);
      playheadRef.current?.renderIdle();
    },
    [setScrollPosition, playheadRef],
  );

  // True from a user-initiated gesture until its debounced seek commits
  // (gestureActive or pendingSeek — see scrubGesture.ts). Geometry-change
  // resyncs must not fire in this window: they would snap scrollTop back to
  // the stale pre-scrub transport time, yanking the timeline out from under
  // an active drag (e.g. when the drag itself collapses the mobile address
  // bar and resizes the viewport). Skipping is safe — the pending seek
  // re-derives the time from the final scroll position against the
  // then-current mapping.
  const isUserScrubbing = useCallback(
    () => isGestureInProgress(scrubStateRef.current),
    [],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
    handleWheel,
    handleScroll,
    isUserScrubbing,
    syncScrollToTime,
  };
}

/**
 * Tracks the offset stage's content height and returns it for use as the
 * PhantomScroller spacer height.
 *
 * The offset stage's height is the Timeline content plus its
 * projection-corrected padding. The phantom scroller's spacer must match
 * this height so the phantom's scrollable range covers the whole timeline.
 */
export function useSpacerHeight(
  offsetRef: RefObject<HTMLDivElement | null>,
): number {
  const [spacerHeight, setSpacerHeight] = useState(0);

  useLayoutEffect(() => {
    const el = offsetRef.current;
    if (!el) return;

    const update = () => setSpacerHeight(el.offsetHeight);
    update();

    // MutationObserver catches DOM structure changes (tracks added/removed)
    // and attribute changes (recording spectrogram height updates via
    // inline style). ResizeObserver catches size changes (zoom).
    const observer = new MutationObserver(() => update());
    const resizeObserver = new ResizeObserver(() => update());

    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });
    resizeObserver.observe(el);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [offsetRef]);

  return spacerHeight;
}
