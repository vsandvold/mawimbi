import {
  consumePendingSeek,
  isPlaying,
  loudness,
  resetTransportSignals,
  stopAndRewindPlayback,
  togglePlayback,
  totalTime,
  transportTime,
} from '../transportSignals';

afterEach(() => {
  resetTransportSignals();
});

describe('transportSignals', () => {
  describe('initial values', () => {
    it('has transportTime at 0', () => {
      expect(transportTime.value).toBe(0);
    });

    it('has isPlaying as false', () => {
      expect(isPlaying.value).toBe(false);
    });

    it('has loudness at 0', () => {
      expect(loudness.value).toBe(0);
    });

    it('has totalTime at 0', () => {
      expect(totalTime.value).toBe(0);
    });
  });

  describe('signal updates', () => {
    it('allows updating transportTime', () => {
      transportTime.value = 42.5;

      expect(transportTime.value).toBe(42.5);
    });

    it('allows toggling isPlaying', () => {
      isPlaying.value = true;

      expect(isPlaying.value).toBe(true);
    });

    it('allows updating loudness', () => {
      loudness.value = -12;

      expect(loudness.value).toBe(-12);
    });

    it('allows updating totalTime', () => {
      totalTime.value = 120;

      expect(totalTime.value).toBe(120);
    });
  });

  describe('togglePlayback', () => {
    it('starts playback when paused', () => {
      togglePlayback();

      expect(isPlaying.value).toBe(true);
    });

    it('pauses playback when playing', () => {
      isPlaying.value = true;

      togglePlayback();

      expect(isPlaying.value).toBe(false);
    });

    it('restarts from beginning when at end of playback and paused', () => {
      transportTime.value = 10.0;
      totalTime.value = 10.0;

      togglePlayback();

      expect(isPlaying.value).toBe(true);
      expect(transportTime.value).toBe(0);
    });

    it('handles end-of-playback comparison with toFixed(1) rounding', () => {
      // 10.04.toFixed(1) === "10.0" === 10.0.toFixed(1) → treated as end of playback
      transportTime.value = 10.04;
      totalTime.value = 10.0;

      togglePlayback();

      expect(isPlaying.value).toBe(true);
      expect(transportTime.value).toBe(0);
    });

    it('does not restart when not quite at end of playback', () => {
      transportTime.value = 9.8;
      totalTime.value = 10.0;

      togglePlayback();

      expect(isPlaying.value).toBe(true);
      expect(transportTime.value).toBe(9.8);
    });

    it('sets pending seek when restarting from end of playback', () => {
      transportTime.value = 10.0;
      totalTime.value = 10.0;

      togglePlayback();

      expect(consumePendingSeek()).toBe(0);
    });

    it('does not set pending seek for normal toggle', () => {
      totalTime.value = 10;

      togglePlayback();

      expect(consumePendingSeek()).toBeNull();
    });
  });

  describe('stopAndRewindPlayback', () => {
    it('stops playback and rewinds to beginning', () => {
      isPlaying.value = true;
      transportTime.value = 5.0;

      stopAndRewindPlayback();

      expect(isPlaying.value).toBe(false);
      expect(transportTime.value).toBe(0);
    });

    it('sets pending seek to 0', () => {
      isPlaying.value = true;
      transportTime.value = 5.0;

      stopAndRewindPlayback();

      expect(consumePendingSeek()).toBe(0);
    });
  });

  describe('consumePendingSeek', () => {
    it('returns null when no seek is pending', () => {
      expect(consumePendingSeek()).toBeNull();
    });

    it('clears the pending seek after consumption', () => {
      stopAndRewindPlayback();

      consumePendingSeek();

      expect(consumePendingSeek()).toBeNull();
    });
  });

  describe('resetTransportSignals', () => {
    it('resets all transport signals to defaults', () => {
      transportTime.value = 99;
      isPlaying.value = true;
      loudness.value = -6;
      totalTime.value = 120;

      resetTransportSignals();

      expect(transportTime.value).toBe(0);
      expect(isPlaying.value).toBe(false);
      expect(loudness.value).toBe(0);
      expect(totalTime.value).toBe(0);
    });

    it('clears pending seek', () => {
      stopAndRewindPlayback();

      resetTransportSignals();

      expect(consumePendingSeek()).toBeNull();
    });
  });
});
