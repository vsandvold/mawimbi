import * as Tone from 'tone';
import PlaybackService from '../PlaybackService';

let service: PlaybackService;

beforeEach(() => {
  const transport = Tone.getTransport();
  transport.seconds = 0;
  vi.mocked(transport.start).mockClear();
  vi.mocked(transport.stop).mockClear();
  vi.mocked(transport.pause).mockClear();
  service = new PlaybackService(transport);
});

describe('PlaybackService', () => {
  describe('initial state', () => {
    it('starts in stopped state', () => {
      expect(service.playbackState.value).toBe('stopped');
    });

    it('has transportTime at 0', () => {
      expect(service.transportTime.value).toBe(0);
    });

    it('has totalTime at 0', () => {
      expect(service.totalTime.value).toBe(0);
    });

    it('has loudness at 0', () => {
      expect(service.loudness.value).toBe(0);
    });

    it('reports isPlaying as false', () => {
      expect(service.isPlaying.value).toBe(false);
    });
  });

  describe('play', () => {
    it('transitions from stopped to playing', () => {
      service.play();

      expect(service.playbackState.value).toBe('playing');
      expect(service.isPlaying.value).toBe(true);
    });

    it('calls transport.start()', () => {
      service.play();

      expect(Tone.getTransport().start).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when already playing', () => {
      service.play();
      vi.mocked(Tone.getTransport().start).mockClear();

      service.play();

      expect(Tone.getTransport().start).not.toHaveBeenCalled();
    });

    it('transitions from paused to playing', () => {
      service.play();
      service.pause();

      service.play();

      expect(service.playbackState.value).toBe('playing');
    });

    it('rewinds when playing from end of timeline', () => {
      service.transportTime.value = 10.0;
      service.totalTime.value = 10.0;

      service.play();

      expect(service.transportTime.value).toBe(0);
      expect(Tone.getTransport().seconds).toBe(0);
      expect(service.isPlaying.value).toBe(true);
    });

    it('handles end-of-playback comparison with toFixed(1) rounding', () => {
      service.transportTime.value = 10.04;
      service.totalTime.value = 10.0;

      service.play();

      expect(service.transportTime.value).toBe(0);
      expect(service.isPlaying.value).toBe(true);
    });

    it('does not restart when not quite at end of playback', () => {
      service.transportTime.value = 9.8;
      service.totalTime.value = 10.0;

      service.play();

      expect(service.transportTime.value).toBe(9.8);
      expect(service.isPlaying.value).toBe(true);
    });
  });

  describe('pause', () => {
    it('transitions from playing to paused', () => {
      service.play();

      service.pause();

      expect(service.playbackState.value).toBe('paused');
      expect(service.isPaused()).toBe(true);
    });

    it('calls transport.pause()', () => {
      service.play();

      service.pause();

      expect(Tone.getTransport().pause).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when stopped', () => {
      service.pause();

      expect(service.playbackState.value).toBe('stopped');
    });

    it('is a no-op when already paused', () => {
      service.play();
      service.pause();
      vi.mocked(Tone.getTransport().pause).mockClear();

      service.pause();

      expect(Tone.getTransport().pause).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('transitions from playing to stopped', () => {
      service.play();

      service.stop();

      expect(service.playbackState.value).toBe('stopped');
      expect(service.isStopped()).toBe(true);
    });

    it('calls transport.stop()', () => {
      service.play();

      service.stop();

      expect(Tone.getTransport().stop).toHaveBeenCalledTimes(1);
    });

    it('transitions from paused to stopped', () => {
      service.play();
      service.pause();

      service.stop();

      expect(service.playbackState.value).toBe('stopped');
    });

    it('is a no-op when already stopped', () => {
      service.stop();

      expect(Tone.getTransport().stop).not.toHaveBeenCalled();
    });
  });

  describe('togglePlayback', () => {
    it('starts playback when stopped', () => {
      service.togglePlayback();

      expect(service.isPlaying.value).toBe(true);
    });

    it('pauses playback when playing', () => {
      service.play();

      service.togglePlayback();

      expect(service.isPlaying.value).toBe(false);
      expect(service.playbackState.value).toBe('paused');
    });

    it('restarts from beginning when at end of playback', () => {
      service.transportTime.value = 10.0;
      service.totalTime.value = 10.0;

      service.togglePlayback();

      expect(service.isPlaying.value).toBe(true);
      expect(service.transportTime.value).toBe(0);
    });
  });

  describe('rewind', () => {
    it('stops playback and rewinds to beginning', () => {
      service.play();
      service.transportTime.value = 5.0;

      service.rewind();

      expect(service.isPlaying.value).toBe(false);
      expect(service.playbackState.value).toBe('stopped');
      expect(service.transportTime.value).toBe(0);
      expect(Tone.getTransport().seconds).toBe(0);
    });
  });

  describe('seekTo', () => {
    it('updates both transportTime signal and engine time', () => {
      service.seekTo(5.0);

      expect(service.transportTime.value).toBe(5.0);
      expect(Tone.getTransport().seconds).toBe(5.0);
    });
  });

  describe('getEngineTime / setEngineTime', () => {
    it('reads from transport', () => {
      Tone.getTransport().seconds = 42;

      expect(service.getEngineTime()).toBe(42);
    });

    it('writes to transport', () => {
      service.setEngineTime(10);

      expect(Tone.getTransport().seconds).toBe(10);
    });
  });

  describe('reset', () => {
    it('resets all state to defaults', () => {
      service.play();
      service.transportTime.value = 99;
      service.totalTime.value = 120;
      service.loudness.value = -6;

      service.reset();

      expect(service.playbackState.value).toBe('stopped');
      expect(service.transportTime.value).toBe(0);
      expect(service.totalTime.value).toBe(0);
      expect(service.loudness.value).toBe(0);
    });
  });
});
