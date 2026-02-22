import {
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

  describe('resetFocusSignals', () => {
    it('clears all focused tracks', () => {
      focusTrack('track-1');
      focusTrack('track-2');

      resetFocusSignals();

      expect(focusedTracks.value).toEqual([]);
    });
  });
});
