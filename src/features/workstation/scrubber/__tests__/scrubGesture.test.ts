import {
  isGestureInProgress,
  nextScrubState,
  SCRUB_MOVEMENT_THRESHOLD_PX,
  type ScrubState,
} from '../scrubGesture';

describe('nextScrubState', () => {
  describe('pointerMove', () => {
    it('stays idle below the movement threshold (G4 — a resting finger never scrubs)', () => {
      const state = nextScrubState('idle', {
        type: 'pointerMove',
        distancePx: SCRUB_MOVEMENT_THRESHOLD_PX - 1,
      });

      expect(state).toBe('idle');
    });

    it('enters gestureActive at the movement threshold', () => {
      const state = nextScrubState('idle', {
        type: 'pointerMove',
        distancePx: SCRUB_MOVEMENT_THRESHOLD_PX,
      });

      expect(state).toBe('gestureActive');
    });

    it('enters gestureActive past the movement threshold', () => {
      const state = nextScrubState('idle', {
        type: 'pointerMove',
        distancePx: SCRUB_MOVEMENT_THRESHOLD_PX + 50,
      });

      expect(state).toBe('gestureActive');
    });
  });

  describe('wheel', () => {
    it('enters gestureActive from idle', () => {
      expect(nextScrubState('idle', { type: 'wheel' })).toBe('gestureActive');
    });

    it('re-enters gestureActive from pendingSeek (a new wheel tick before the debounce fires)', () => {
      expect(nextScrubState('pendingSeek', { type: 'wheel' })).toBe(
        'gestureActive',
      );
    });
  });

  describe('pointerEnd', () => {
    it('transitions gestureActive to pendingSeek', () => {
      expect(nextScrubState('gestureActive', { type: 'pointerEnd' })).toBe(
        'pendingSeek',
      );
    });

    it('is a no-op from idle (a tap that never crossed the threshold)', () => {
      expect(nextScrubState('idle', { type: 'pointerEnd' })).toBe('idle');
    });

    it('is a no-op from pendingSeek', () => {
      expect(nextScrubState('pendingSeek', { type: 'pointerEnd' })).toBe(
        'pendingSeek',
      );
    });
  });

  describe('seekCommitted', () => {
    const states: ScrubState[] = ['idle', 'gestureActive', 'pendingSeek'];

    it.each(states)('resolves %s to idle', (state) => {
      expect(nextScrubState(state, { type: 'seekCommitted' })).toBe('idle');
    });
  });
});

describe('isGestureInProgress', () => {
  it('is false when idle', () => {
    expect(isGestureInProgress('idle')).toBe(false);
  });

  it('is true when gestureActive or pendingSeek', () => {
    expect(isGestureInProgress('gestureActive')).toBe(true);
    expect(isGestureInProgress('pendingSeek')).toBe(true);
  });
});
