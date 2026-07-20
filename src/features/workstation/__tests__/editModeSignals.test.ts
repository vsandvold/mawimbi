import {
  cycleActiveTrack,
  enterEditMode,
  exitEditMode,
  getActiveEditTrackId,
  resetEditModeSignals,
} from '../editModeSignals';

afterEach(() => {
  resetEditModeSignals();
});

describe('editModeSignals', () => {
  describe('initial value', () => {
    it('has no active edit track', () => {
      expect(getActiveEditTrackId()).toBeNull();
    });
  });

  describe('enterEditMode', () => {
    it('sets the active edit track', () => {
      enterEditMode('track-1');

      expect(getActiveEditTrackId()).toBe('track-1');
    });

    it('replaces a previously active track', () => {
      enterEditMode('track-1');
      enterEditMode('track-2');

      expect(getActiveEditTrackId()).toBe('track-2');
    });
  });

  describe('exitEditMode', () => {
    it('clears the active edit track', () => {
      enterEditMode('track-1');

      exitEditMode();

      expect(getActiveEditTrackId()).toBeNull();
    });
  });

  describe('cycleActiveTrack', () => {
    const trackIds = ['track-1', 'track-2', 'track-3'];

    it('moves to the next track', () => {
      enterEditMode('track-1');

      cycleActiveTrack(trackIds, 'next');

      expect(getActiveEditTrackId()).toBe('track-2');
    });

    it('moves to the previous track', () => {
      enterEditMode('track-2');

      cycleActiveTrack(trackIds, 'previous');

      expect(getActiveEditTrackId()).toBe('track-1');
    });

    it('clamps at the newest end (no wrap)', () => {
      enterEditMode('track-3');

      cycleActiveTrack(trackIds, 'next');

      expect(getActiveEditTrackId()).toBe('track-3');
    });

    it('clamps at the oldest end (no wrap)', () => {
      enterEditMode('track-1');

      cycleActiveTrack(trackIds, 'previous');

      expect(getActiveEditTrackId()).toBe('track-1');
    });

    it('does nothing when not in edit mode', () => {
      cycleActiveTrack(trackIds, 'next');

      expect(getActiveEditTrackId()).toBeNull();
    });

    it('does nothing when the active track is not in the list', () => {
      enterEditMode('track-unknown');

      cycleActiveTrack(trackIds, 'next');

      expect(getActiveEditTrackId()).toBe('track-unknown');
    });
  });

  describe('resetEditModeSignals', () => {
    it('clears the active edit track', () => {
      enterEditMode('track-1');

      resetEditModeSignals();

      expect(getActiveEditTrackId()).toBeNull();
    });
  });
});
