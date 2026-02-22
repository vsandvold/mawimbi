import { TrackSignalStore } from '../trackSignals';
import { resetAllSignals } from './testUtils';

afterEach(() => {
  resetAllSignals();
});

describe('TrackSignalStore', () => {
  describe('create', () => {
    it('creates signals with default values', () => {
      const signals = TrackSignalStore.create('track-1');

      expect(signals.volume.value).toBe(100);
      expect(signals.mute.value).toBe(false);
      expect(signals.solo.value).toBe(false);
    });

    it('stores the signals so they can be retrieved', () => {
      TrackSignalStore.create('track-1');

      const retrieved = TrackSignalStore.get('track-1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.volume.value).toBe(100);
    });
  });

  describe('get', () => {
    it('returns undefined for unknown track', () => {
      expect(TrackSignalStore.get('nonexistent')).toBeUndefined();
    });
  });

  describe('dispose', () => {
    it('removes the signals for a track', () => {
      TrackSignalStore.create('track-1');

      TrackSignalStore.dispose('track-1');

      expect(TrackSignalStore.get('track-1')).toBeUndefined();
    });

    it('does not affect other tracks', () => {
      TrackSignalStore.create('track-1');
      TrackSignalStore.create('track-2');

      TrackSignalStore.dispose('track-1');

      expect(TrackSignalStore.get('track-2')).toBeDefined();
    });
  });

  describe('reset', () => {
    it('clears all track signals', () => {
      TrackSignalStore.create('track-1');
      TrackSignalStore.create('track-2');

      TrackSignalStore.reset();

      expect(TrackSignalStore.get('track-1')).toBeUndefined();
      expect(TrackSignalStore.get('track-2')).toBeUndefined();
    });
  });

  describe('keys', () => {
    it('returns all track ids', () => {
      TrackSignalStore.create('track-1');
      TrackSignalStore.create('track-2');

      const ids = Array.from(TrackSignalStore.keys());

      expect(ids).toEqual(['track-1', 'track-2']);
    });
  });

  describe('signal reactivity', () => {
    it('allows updating volume', () => {
      const signals = TrackSignalStore.create('track-1');

      signals.volume.value = 75;

      expect(signals.volume.value).toBe(75);
      expect(TrackSignalStore.get('track-1')!.volume.value).toBe(75);
    });

    it('allows toggling mute', () => {
      const signals = TrackSignalStore.create('track-1');

      signals.mute.value = true;

      expect(signals.mute.value).toBe(true);
    });

    it('allows toggling solo', () => {
      const signals = TrackSignalStore.create('track-1');

      signals.solo.value = true;

      expect(signals.solo.value).toBe(true);
    });
  });
});
