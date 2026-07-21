import {
  getFocusedTracks,
  focusTrack,
  unfocusTrack,
  getDragTargetTrackId,
  setDragTargetTrackId,
  resetFocusSignals,
} from '../focusSignals';

afterEach(() => {
  resetFocusSignals();
});

describe('focusSignals', () => {
  describe('initial values', () => {
    it('has empty focusedTracks', () => {
      expect(getFocusedTracks()).toEqual([]);
    });
  });

  describe('focusTrack', () => {
    it('adds a track to focusedTracks', () => {
      focusTrack('track-1');

      expect(getFocusedTracks()).toEqual(['track-1']);
    });

    it('adds multiple tracks', () => {
      focusTrack('track-1');
      focusTrack('track-2');

      expect(getFocusedTracks()).toEqual(['track-1', 'track-2']);
    });

    it('does not add duplicate tracks', () => {
      focusTrack('track-1');
      focusTrack('track-1');

      expect(getFocusedTracks()).toEqual(['track-1']);
    });
  });

  describe('unfocusTrack', () => {
    it('removes a track from focusedTracks', () => {
      focusTrack('track-1');
      focusTrack('track-2');

      unfocusTrack('track-1');

      expect(getFocusedTracks()).toEqual(['track-2']);
    });

    it('handles unfocusing a track that is not focused', () => {
      focusTrack('track-1');

      unfocusTrack('track-2');

      expect(getFocusedTracks()).toEqual(['track-1']);
    });
  });

  describe('dragTargetTrackId', () => {
    it('starts null', () => {
      expect(getDragTargetTrackId()).toBeNull();
    });

    it('sets the drag target', () => {
      setDragTargetTrackId('track-1');

      expect(getDragTargetTrackId()).toBe('track-1');
    });

    it('moves the target when set again', () => {
      setDragTargetTrackId('track-1');
      setDragTargetTrackId('track-2');

      expect(getDragTargetTrackId()).toBe('track-2');
    });

    it('clears the target', () => {
      setDragTargetTrackId('track-1');
      setDragTargetTrackId(null);

      expect(getDragTargetTrackId()).toBeNull();
    });
  });

  describe('resetFocusSignals', () => {
    it('clears all focused tracks', () => {
      focusTrack('track-1');
      focusTrack('track-2');

      resetFocusSignals();

      expect(getFocusedTracks()).toEqual([]);
    });

    it('clears the drag target', () => {
      setDragTargetTrackId('track-1');

      resetFocusSignals();

      expect(getDragTargetTrackId()).toBeNull();
    });
  });
});
