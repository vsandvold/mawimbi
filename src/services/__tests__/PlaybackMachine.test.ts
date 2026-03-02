import {
  consumePendingSeek,
  isPlaying,
  isPaused,
  isStopped,
  loudness,
  pause,
  play,
  playbackState,
  resetPlaybackMachine,
  rewind,
  seekTo,
  stop,
  togglePlayback,
  totalTime,
  transportTime,
} from '../PlaybackMachine';

afterEach(() => {
  resetPlaybackMachine();
});

describe('PlaybackMachine', () => {
  describe('initial state', () => {
    it('starts in stopped state', () => {
      expect(playbackState.value).toBe('stopped');
    });

    it('has transportTime at 0', () => {
      expect(transportTime.value).toBe(0);
    });

    it('has totalTime at 0', () => {
      expect(totalTime.value).toBe(0);
    });

    it('has loudness at 0', () => {
      expect(loudness.value).toBe(0);
    });

    it('reports isStopped as true', () => {
      expect(isStopped()).toBe(true);
    });

    it('reports isPlaying as false', () => {
      expect(isPlaying()).toBe(false);
    });
  });

  describe('play', () => {
    it('transitions from stopped to playing', () => {
      play();

      expect(playbackState.value).toBe('playing');
      expect(isPlaying()).toBe(true);
    });

    it('transitions from paused to playing', () => {
      play();
      pause();

      play();

      expect(playbackState.value).toBe('playing');
    });

    it('is a no-op when already playing', () => {
      play();

      play();

      expect(playbackState.value).toBe('playing');
    });

    it('restarts from beginning when stopped at end of timeline', () => {
      transportTime.value = 10.0;
      totalTime.value = 10.0;

      play();

      expect(playbackState.value).toBe('playing');
      expect(transportTime.value).toBe(0);
      expect(consumePendingSeek()).toBe(0);
    });

    it('handles end-of-timeline with toFixed(1) rounding', () => {
      transportTime.value = 10.04;
      totalTime.value = 10.0;

      play();

      expect(playbackState.value).toBe('playing');
      expect(transportTime.value).toBe(0);
    });

    it('does not restart when not at end of timeline', () => {
      transportTime.value = 9.8;
      totalTime.value = 10.0;

      play();

      expect(transportTime.value).toBe(9.8);
    });

    it('does not restart from empty timeline', () => {
      transportTime.value = 0;
      totalTime.value = 0;

      play();

      expect(consumePendingSeek()).toBeNull();
    });
  });

  describe('pause', () => {
    it('transitions from playing to paused', () => {
      play();

      pause();

      expect(playbackState.value).toBe('paused');
      expect(isPaused()).toBe(true);
    });

    it('is a no-op when stopped', () => {
      pause();

      expect(playbackState.value).toBe('stopped');
    });

    it('is a no-op when already paused', () => {
      play();
      pause();

      pause();

      expect(playbackState.value).toBe('paused');
    });
  });

  describe('stop', () => {
    it('transitions from playing to stopped', () => {
      play();

      stop();

      expect(playbackState.value).toBe('stopped');
    });

    it('transitions from paused to stopped', () => {
      play();
      pause();

      stop();

      expect(playbackState.value).toBe('stopped');
    });

    it('is a no-op when already stopped', () => {
      stop();

      expect(playbackState.value).toBe('stopped');
    });
  });

  describe('togglePlayback', () => {
    it('starts playback when stopped', () => {
      togglePlayback();

      expect(playbackState.value).toBe('playing');
    });

    it('pauses playback when playing', () => {
      play();

      togglePlayback();

      expect(playbackState.value).toBe('paused');
    });

    it('resumes playback when paused', () => {
      play();
      pause();

      togglePlayback();

      expect(playbackState.value).toBe('playing');
    });
  });

  describe('rewind', () => {
    it('stops playback and rewinds to 0', () => {
      play();
      transportTime.value = 5.0;

      rewind();

      expect(playbackState.value).toBe('stopped');
      expect(transportTime.value).toBe(0);
    });

    it('sets pending seek to 0', () => {
      play();
      transportTime.value = 5.0;

      rewind();

      expect(consumePendingSeek()).toBe(0);
    });

    it('rewinds from paused state', () => {
      play();
      transportTime.value = 3.0;
      pause();

      rewind();

      expect(playbackState.value).toBe('stopped');
      expect(transportTime.value).toBe(0);
    });
  });

  describe('seekTo', () => {
    it('updates transportTime and sets pending seek', () => {
      seekTo(5.0);

      expect(transportTime.value).toBe(5.0);
      expect(consumePendingSeek()).toBe(5.0);
    });
  });

  describe('consumePendingSeek', () => {
    it('returns null when no seek is pending', () => {
      expect(consumePendingSeek()).toBeNull();
    });

    it('clears the pending seek after consumption', () => {
      rewind();

      consumePendingSeek();

      expect(consumePendingSeek()).toBeNull();
    });
  });

  describe('resetPlaybackMachine', () => {
    it('resets all state to defaults', () => {
      playbackState.value = 'playing';
      transportTime.value = 99;
      totalTime.value = 120;
      loudness.value = -6;

      resetPlaybackMachine();

      expect(playbackState.value).toBe('stopped');
      expect(transportTime.value).toBe(0);
      expect(totalTime.value).toBe(0);
      expect(loudness.value).toBe(0);
    });

    it('clears pending seek', () => {
      rewind();

      resetPlaybackMachine();

      expect(consumePendingSeek()).toBeNull();
    });
  });
});
