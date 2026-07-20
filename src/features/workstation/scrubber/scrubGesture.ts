/**
 * Input-driven scrub gesture state machine (spec 002, Design).
 *
 * Replaces the scrubber's former heuristic scroll-source attribution
 * (`isProgrammaticScrollRef` / `isPointerDownRef` booleans), which inferred
 * "user scrub" from `scroll` events and could misclassify the playback
 * animation loop's own `scrollTop` writes as user input (mawimbi#472).
 *
 * Scrub state is entered only from real input events — a wheel tick, or
 * pointer movement past `SCRUB_MOVEMENT_THRESHOLD_PX` — never inferred from
 * `scroll` events. A resting finger (pointerdown with no movement) never
 * enters a gesture (G4). `scroll` events never reach this reducer at all —
 * the caller (useScrubberScroll.ts) only uses them to sync visuals and, via
 * `isGestureInProgress`, to extend the seek debounce while a gesture is
 * already active or settling.
 *
 * `gestureActive` and `pendingSeek` are currently treated identically by
 * every consumer (both are "in progress" per `isGestureInProgress`) — the
 * distinction exists for the council-decided design (spec 002) and for
 * milestone 3's command epoch (issue #475), which needs to tell "a gesture
 * is live" apart from "a gesture ended, resume still armed" when deciding
 * whether an intervening explicit command should cancel it.
 */

export type ScrubState = 'idle' | 'gestureActive' | 'pendingSeek';

export type ScrubEvent =
  /** Pointer/touch movement, measured as cumulative distance from pointerdown. */
  | { type: 'pointerMove'; distancePx: number }
  /** A wheel tick not used for zoom (no Ctrl/Meta modifier). */
  | { type: 'wheel' }
  /** Pointer released, cancelled, or lost capture (up/cancel/lostpointercapture). */
  | { type: 'pointerEnd' }
  /** The debounced seek fired and (if armed) playback resumed. */
  | { type: 'seekCommitted' }
  /**
   * A second finger joined mid-drag, turning an in-progress single-finger
   * gesture into a pinch (G5 — pinch never scrubs). The pointer-count gate
   * in useScrubberScroll.ts already keeps a pinch from *entering* a gesture
   * when both fingers land together, but a gesture already active from the
   * first finger's own movement isn't touched by that gate — this event
   * aborts it instead of letting it ride to a seek/resume.
   */
  | { type: 'pinchStarted' };

export const SCRUB_MOVEMENT_THRESHOLD_PX = 8;

export function nextScrubState(
  state: ScrubState,
  event: ScrubEvent,
): ScrubState {
  switch (event.type) {
    case 'pointerMove':
      return event.distancePx >= SCRUB_MOVEMENT_THRESHOLD_PX
        ? 'gestureActive'
        : state;
    case 'wheel':
      return 'gestureActive';
    case 'pointerEnd':
      return state === 'gestureActive' ? 'pendingSeek' : state;
    case 'seekCommitted':
      return 'idle';
    case 'pinchStarted':
      return 'idle';
  }
}

/** True while a gesture is live or settling — the window in which the
 * geometry-change resync guard must not fire (Scrubber.tsx) and in which
 * `scroll` events should extend the seek debounce. */
export function isGestureInProgress(state: ScrubState): boolean {
  return state !== 'idle';
}
