import { useRef } from 'react';
import { type TrackId } from '../../tracks/types';
import { cycleActiveTrack, getActiveEditTrackId } from '../editModeSignals';
import { SCRUB_MOVEMENT_THRESHOLD_PX } from './scrubGesture';

type PointerPosition = { x: number; y: number };
type Axis = 'horizontal' | 'vertical';

type UseTrackCycleGestureOptions = {
  trackIds: TrackId[];
};

/**
 * Recognizes a horizontal swipe on the runway as a track-cycle gesture,
 * active only while edit mode is on (spec 004, milestone 3; requires the
 * PhantomScroller's `touch-action: pan-y`, which already leaves horizontal
 * gestures to JS). Axis locks on the first movement past
 * `SCRUB_MOVEMENT_THRESHOLD_PX`, comparing horizontal vs. vertical
 * distance from the pointerdown origin — a predominantly horizontal
 * gesture cycles the active track on release; a predominantly vertical one
 * leaves the vertical scrub gesture untouched.
 *
 * `isCyclingRef` reports a locked-in horizontal gesture so the vertical
 * scrub controller (`useScrubberScroll`) can stand down for it and so the
 * tap-to-toggle click that can still follow a touch release is suppressed
 * — the same pattern `useTimelineZoom`'s `isPinchingRef` uses to override
 * the scrub controller for a competing gesture.
 */
export function useTrackCycleGesture({
  trackIds,
}: UseTrackCycleGestureOptions) {
  const isCyclingRef = useRef(false);
  const originRef = useRef<PointerPosition | null>(null);
  const lastPosRef = useRef<PointerPosition | null>(null);
  const axisRef = useRef<Axis | null>(null);
  const pointerCountRef = useRef(0);

  // Only a pointer sequence's first finger starts (or restarts) a gesture —
  // a second pointer joining mid-gesture (e.g. a pinch's other finger) just
  // increments the count and otherwise leaves origin/axis/isCycling alone,
  // the same way useScrubberScroll's own handlePointerDown never touches
  // scrubStateRef on a second pointer. Resetting unconditionally here would
  // wipe out an already-locked horizontal gesture the moment any second
  // pointer briefly touches down (e.g. an incidental palm brush) without
  // ever becoming a real pinch, silently dropping a legitimate one-finger
  // swipe that never lifted.
  const handlePointerDown = (e: React.PointerEvent) => {
    pointerCountRef.current += 1;
    if (pointerCountRef.current !== 1) return;

    isCyclingRef.current = false;
    axisRef.current = null;
    originRef.current =
      getActiveEditTrackId() !== null ? { x: e.clientX, y: e.clientY } : null;
    lastPosRef.current = originRef.current;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const origin = originRef.current;
    if (!origin) return;

    lastPosRef.current = { x: e.clientX, y: e.clientY };
    // Axis already decided for this gesture — only the release handler
    // needs the updated lastPosRef from here on.
    if (axisRef.current !== null) return;

    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (Math.hypot(dx, dy) < SCRUB_MOVEMENT_THRESHOLD_PX) return;

    axisRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    if (axisRef.current === 'horizontal') {
      isCyclingRef.current = true;
    }
  };

  // Direction mapping (spec 004 #491): swipe left (finger moves toward
  // negative x) = next-newer track; swipe right = next-older.
  const handlePointerEnd = () => {
    pointerCountRef.current = Math.max(0, pointerCountRef.current - 1);

    const origin = originRef.current;
    const last = lastPosRef.current;
    const wasHorizontal = axisRef.current === 'horizontal';
    originRef.current = null;
    axisRef.current = null;

    if (!wasHorizontal || !origin || !last) return;

    const dx = last.x - origin.x;
    if (Math.abs(dx) < SCRUB_MOVEMENT_THRESHOLD_PX) return;

    cycleActiveTrack(trackIds, dx < 0 ? 'next' : 'previous');
    // isCyclingRef intentionally stays true until the next pointerdown — a
    // synthetic click can still follow this gesture's pointerup, and it
    // must keep reading as "a gesture happened" so the click doesn't also
    // toggle playback.
  };

  return {
    isCyclingRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
  };
}
