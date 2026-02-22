import { vi } from 'vitest';
import {
  debouncedUnfocusTrack,
  focusedTracks,
  focusTrack,
  unfocusTrack,
  resetFocusSignals,
} from '../focusSignals';

afterEach(() => {
  resetFocusSignals();
});

describe('focusSignals', () => {
  describe('initial values', () => {
    it('has empty focusedTracks', () => {
      expect(focusedTracks.value).toEqual([]);
    });
  });

  describe('focusTrack', () => {
    it('adds a track to focusedTracks', () => {
      focusTrack('track-1');

      expect(focusedTracks.value).toEqual(['track-1']);
    });

    it('adds multiple tracks', () => {
      focusTrack('track-1');
      focusTrack('track-2');

      expect(focusedTracks.value).toEqual(['track-1', 'track-2']);
    });

    it('does not add duplicate tracks', () => {
      focusTrack('track-1');
      focusTrack('track-1');

      expect(focusedTracks.value).toEqual(['track-1']);
    });
  });

  describe('unfocusTrack', () => {
    it('removes a track from focusedTracks', () => {
      focusTrack('track-1');
      focusTrack('track-2');

      unfocusTrack('track-1');

      expect(focusedTracks.value).toEqual(['track-2']);
    });

    it('handles unfocusing a track that is not focused', () => {
      focusTrack('track-1');

      unfocusTrack('track-2');

      expect(focusedTracks.value).toEqual(['track-1']);
    });
  });

  describe('debouncedUnfocusTrack', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('unfocuses track after 250ms', () => {
      focusTrack('track-1');

      debouncedUnfocusTrack('track-1');

      expect(focusedTracks.value).toEqual(['track-1']);

      vi.advanceTimersByTime(250);

      expect(focusedTracks.value).toEqual([]);
    });

    it('resets debounce timer on repeated calls', () => {
      focusTrack('track-1');

      debouncedUnfocusTrack('track-1');
      vi.advanceTimersByTime(200);

      debouncedUnfocusTrack('track-1');
      vi.advanceTimersByTime(200);

      // Should still be focused — second call reset the timer
      expect(focusedTracks.value).toEqual(['track-1']);

      vi.advanceTimersByTime(50);

      expect(focusedTracks.value).toEqual([]);
    });

    it('handles independent debounce timers per track', () => {
      focusTrack('track-1');
      focusTrack('track-2');

      debouncedUnfocusTrack('track-1');
      vi.advanceTimersByTime(100);

      debouncedUnfocusTrack('track-2');
      vi.advanceTimersByTime(150);

      // track-1 should be unfocused (250ms elapsed), track-2 still focused
      expect(focusedTracks.value).toEqual(['track-2']);

      vi.advanceTimersByTime(100);

      expect(focusedTracks.value).toEqual([]);
    });
  });

  describe('resetFocusSignals', () => {
    it('clears all focused tracks', () => {
      focusTrack('track-1');
      focusTrack('track-2');

      resetFocusSignals();

      expect(focusedTracks.value).toEqual([]);
    });

    it('clears pending debounce timers', () => {
      vi.useFakeTimers();

      focusTrack('track-1');
      debouncedUnfocusTrack('track-1');

      resetFocusSignals();
      focusTrack('track-1');

      vi.advanceTimersByTime(250);

      // Timer should have been cleared by reset, so track stays focused
      expect(focusedTracks.value).toEqual(['track-1']);

      vi.useRealTimers();
    });
  });
});
