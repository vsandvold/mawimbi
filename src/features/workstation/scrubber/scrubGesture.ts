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
 * enters a gesture (G4). `scroll` events carry no state transition of their
 * own; they only extend the seek debounce while a gesture is already
 * active or settling (handled by the caller, not this reducer).
 */

export type ScrubState = 'idle' | 'gestureActive' | 'pendingSeek';

export type ScrubEvent =
  /** Pointer/touch movement, measured as cumulative distance from pointerdown. */
  | { type: 'pointerMove'; distancePx: number }
  /** A wheel tick not used for zoom (no Ctrl/Meta modifier). */
  | { type: 'wheel' }
  /** Pointer released, cancelled, or lost capture (up/cancel/lostpointercapture). */
  | { type: 'pointerEnd' }
  /** A native `scroll` event — never drives a transition on its own. */
  | { type: 'scroll' }
  /** The debounced seek fired and (if armed) playback resumed. */
  | { type: 'seekCommitted' };

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
    case 'scroll':
      return state;
    case 'seekCommitted':
      return 'idle';
  }
}

/** True while a gesture is live or settling — the window in which the
 * geometry-change resync guard must not fire (Scrubber.tsx) and in which
 * `scroll` events should extend the seek debounce. */
export function isGestureInProgress(state: ScrubState): boolean {
  return state !== 'idle';
}
