import * as Tone from 'tone';
import PlaybackService from '../PlaybackService';

let service: PlaybackService;

beforeEach(() => {
  const transport = Tone.getTransport();
  transport.seconds = 0;
  Object.defineProperty(transport, 'state', {
    value: 'stopped',
    writable: true,
    configurable: true,
  });
  vi.mocked(transport.start).mockClear();
  vi.mocked(transport.stop).mockClear();
  vi.mocked(transport.pause).mockClear();
  service = new PlaybackService(transport);
});

describe('PlaybackService', () => {
  describe('initial state', () => {
    it('starts in stopped state', () => {
      expect(service.playbackState).toBe('stopped');
    });

    it('has transportTime at 0', () => {
      expect(service.transportTime).toBe(0);
    });

    it('has totalTime at 0', () => {
      expect(service.totalTime).toBe(0);
    });

    it('has loudness at 0', () => {
      expect(service.loudness).toBe(0);
    });

    it('reports isPlaying as false', () => {
      expect(service.isPlaying).toBe(false);
    });
  });

  describe('play', () => {
    it('transitions from stopped to playing', () => {
      service.play();

      expect(service.playbackState).toBe('playing');
      expect(service.isPlaying).toBe(true);
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

    it('skips transport.start() when transport is already started', () => {
      // Simulate RecordingService having already started the transport
      // (e.g. via startOverdubRecording) before play() is called.
      (Tone.getTransport() as unknown as { state: string }).state = 'started';

      service.play();

      expect(service.isPlaying).toBe(true);
      expect(Tone.getTransport().start).not.toHaveBeenCalled();
    });

    it('transitions from paused to playing', () => {
      service.play();
      service.pause();

      service.play();

      expect(service.playbackState).toBe('playing');
    });

    it('rewinds when playing from end of timeline', () => {
      service.setTransportTime(10.0);
      service.setTotalTime(10.0);

      service.play();

      expect(service.transportTime).toBe(0);
      expect(Tone.getTransport().seconds).toBe(0);
      expect(service.isPlaying).toBe(true);
    });

    it('handles end-of-playback comparison with toFixed(1) rounding', () => {
      service.setTransportTime(10.04);
      service.setTotalTime(10.0);

      service.play();

      expect(service.transportTime).toBe(0);
      expect(service.isPlaying).toBe(true);
    });

    it('does not restart when not quite at end of playback', () => {
      service.setTransportTime(9.8);
      service.setTotalTime(10.0);

      service.play();

      expect(service.transportTime).toBe(9.8);
      expect(service.isPlaying).toBe(true);
    });
  });

  describe('pause', () => {
    it('transitions from playing to paused', () => {
      service.play();

      service.pause();

      expect(service.playbackState).toBe('paused');
      expect(service.isPaused()).toBe(true);
    });

    it('calls transport.pause()', () => {
      service.play();

      service.pause();

      expect(Tone.getTransport().pause).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when stopped', () => {
      service.pause();

      expect(service.playbackState).toBe('stopped');
    });

    it('is a no-op when already paused', () => {
      service.play();
      service.pause();
      vi.mocked(Tone.getTransport().pause).mockClear();

      service.pause();

      expect(Tone.getTransport().pause).not.toHaveBeenCalled();
    });
  });

  describe('auto-stop at end of timeline', () => {
    it('stops playback when transport time reaches the end', () => {
      service.setTotalTime(10.0);
      service.play();

      service.setTransportTime(10.0);

      expect(service.playbackState).toBe('stopped');
      expect(service.isPlaying).toBe(false);
    });

    it('preserves transport time at the end position', () => {
      service.setTotalTime(10.0);
      service.play();

      service.setTransportTime(10.0);

      expect(service.transportTime).toBe(10.0);
    });

    it('pauses the transport engine to preserve position', () => {
      service.setTotalTime(10.0);
      service.play();
      vi.mocked(Tone.getTransport().pause).mockClear();

      service.setTransportTime(10.0);

      expect(Tone.getTransport().pause).toHaveBeenCalledTimes(1);
      expect(Tone.getTransport().stop).not.toHaveBeenCalled();
    });

    it('does not auto-stop when not playing', () => {
      service.setTotalTime(10.0);

      service.setTransportTime(10.0);

      expect(service.playbackState).toBe('stopped');
      expect(Tone.getTransport().pause).not.toHaveBeenCalled();
    });

    it('handles toFixed(1) rounding at end of timeline', () => {
      service.setTotalTime(10.0);
      service.play();

      service.setTransportTime(10.04);

      expect(service.playbackState).toBe('stopped');
      expect(service.transportTime).toBe(10.04);
    });

    // A toFixed(1)-string comparison can miss the end when a frame steps
    // over the rounding bucket (10.06 rounds to "10.1", never equal to
    // "10.0"). Sweeping small overshoots past a non-round totalTime confirms
    // the raw numeric comparison catches all of them.
    it.each([0.01, 0.02, 0.04, 0.06, 0.09])(
      'stops for a %s s frame-step overshoot past a non-round totalTime',
      (overshoot) => {
        service.setTotalTime(10.03);
        service.play();

        service.setTransportTime(10.03 + overshoot);

        expect(service.playbackState).toBe('stopped');
      },
    );
  });

  describe('stop', () => {
    it('transitions from playing to stopped', () => {
      service.play();

      service.stop();

      expect(service.playbackState).toBe('stopped');
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

      expect(service.playbackState).toBe('stopped');
    });

    it('is a no-op when already stopped', () => {
      service.stop();

      expect(Tone.getTransport().stop).not.toHaveBeenCalled();
    });
  });

  describe('togglePlayback', () => {
    it('starts playback when stopped', () => {
      service.togglePlayback();

      expect(service.isPlaying).toBe(true);
    });

    it('pauses playback when playing', () => {
      service.play();

      service.togglePlayback();

      expect(service.isPlaying).toBe(false);
      expect(service.playbackState).toBe('paused');
    });

    it('restarts from beginning when at end of playback', () => {
      service.setTransportTime(10.0);
      service.setTotalTime(10.0);

      service.togglePlayback();

      expect(service.isPlaying).toBe(true);
      expect(service.transportTime).toBe(0);
    });
  });

  describe('rewind', () => {
    it('stops playback and rewinds to beginning', () => {
      service.play();
      service.setTransportTime(5.0);

      service.rewind();

      expect(service.isPlaying).toBe(false);
      expect(service.playbackState).toBe('stopped');
      expect(service.transportTime).toBe(0);
      expect(Tone.getTransport().seconds).toBe(0);
    });
  });

  describe('seekTo', () => {
    it('updates both transportTime signal and engine time', () => {
      service.seekTo(5.0);

      expect(service.transportTime).toBe(5.0);
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
      service.setTransportTime(99);
      service.setTotalTime(120);
      service.setLoudness(-6);

      service.reset();

      expect(service.playbackState).toBe('stopped');
      expect(service.transportTime).toBe(0);
      expect(service.totalTime).toBe(0);
      expect(service.loudness).toBe(0);
    });
  });
});
