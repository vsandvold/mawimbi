import { vi } from 'vitest';
import * as Tone from 'tone';
import AudioService from '../AudioService';

// jsdom doesn't implement URL.createObjectURL
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
}

// Reset singleton between tests
let audioService: AudioService;

beforeEach(() => {
  // Access private static to reset singleton
  (AudioService as any).instance = undefined;
  audioService = AudioService.getInstance();
});

describe('singleton', () => {
  it('returns the same instance', () => {
    const a = AudioService.getInstance();
    const b = AudioService.getInstance();
    expect(a).toBe(b);
  });
});

describe('createTrack', () => {
  it('decodes audio data and returns a track ID', async () => {
    const arrayBuffer = new ArrayBuffer(16);

    const trackId = await audioService.createTrack(arrayBuffer);

    expect(Tone.context.decodeAudioData).toHaveBeenCalledWith(arrayBuffer);
    expect(trackId).toBeDefined();
    expect(typeof trackId).toBe('string');
  });

  it('creates a mixer channel for the track', async () => {
    const createChannelSpy = vi.spyOn(audioService.mixer, 'createChannel');
    const arrayBuffer = new ArrayBuffer(16);

    const trackId = await audioService.createTrack(arrayBuffer);

    expect(createChannelSpy).toHaveBeenCalledWith(trackId, expect.anything());
  });

  it('stores the blob URL for the track', async () => {
    const arrayBuffer = new ArrayBuffer(16);

    const trackId = await audioService.createTrack(arrayBuffer);
    const blobUrl = audioService.retrieveBlobUrl(trackId);

    expect(blobUrl).toBeDefined();
    expect(blobUrl).toContain('blob:');
  });

  it('stores the audio buffer for the track', async () => {
    const arrayBuffer = new ArrayBuffer(16);

    const trackId = await audioService.createTrack(arrayBuffer);
    const audioBuffer = audioService.retrieveAudioBuffer(trackId);

    expect(audioBuffer).toBeDefined();
  });

  it('returns undefined for unknown track IDs', () => {
    expect(audioService.retrieveBlobUrl('nonexistent')).toBeUndefined();
    expect(audioService.retrieveAudioBuffer('nonexistent')).toBeUndefined();
  });
});

describe('playback control', () => {
  it('starts playback via Tone.Transport', () => {
    audioService.startPlayback();

    expect(Tone.Transport.start).toHaveBeenCalledTimes(1);
  });

  it('starts playback at a given transport time', () => {
    audioService.startPlayback(5.0);

    expect(Tone.Transport.seconds).toBe(5.0);
    expect(Tone.Transport.start).toHaveBeenCalled();
  });

  it('pauses playback via Tone.Transport', () => {
    audioService.pausePlayback();

    expect(Tone.Transport.pause).toHaveBeenCalledTimes(1);
  });

  it('pauses playback and sets transport time', () => {
    audioService.pausePlayback(3.0);

    expect(Tone.Transport.pause).toHaveBeenCalled();
    expect(Tone.Transport.seconds).toBe(3.0);
  });

  it('stops playback via Tone.Transport', () => {
    audioService.stopPlayback();

    expect(Tone.Transport.stop).toHaveBeenCalledTimes(1);
  });

  it('stops playback and sets transport time', () => {
    audioService.stopPlayback(0);

    expect(Tone.Transport.stop).toHaveBeenCalled();
    expect(Tone.Transport.seconds).toBe(0);
  });

  it('toggles from stopped to started', () => {
    Tone.Transport.state = 'stopped';

    audioService.togglePlayback();

    expect(Tone.Transport.start).toHaveBeenCalled();
  });

  it('toggles from started to paused', () => {
    Tone.Transport.state = 'started';

    audioService.togglePlayback();

    expect(Tone.Transport.pause).toHaveBeenCalled();
  });
});

describe('transport time', () => {
  it('gets transport time from Tone.Transport', () => {
    Tone.Transport.seconds = 42;

    expect(audioService.getTransportTime()).toBe(42);
  });

  it('sets transport time on Tone.Transport', () => {
    audioService.setTransportTime(10);

    expect(Tone.Transport.seconds).toBe(10);
  });
});

describe('getTotalTime', () => {
  it('returns 0 when no tracks exist', () => {
    expect(audioService.getTotalTime()).toBe(0);
  });

  it('returns the duration of the longest track', async () => {
    // decodeAudioData returns {} by default, but we need duration
    const mockBuffer1 = { duration: 5.0 };
    const mockBuffer2 = { duration: 10.0 };
    const mockBuffer3 = { duration: 3.0 };

    vi.mocked(Tone.context.decodeAudioData)
      .mockResolvedValueOnce(mockBuffer1 as any)
      .mockResolvedValueOnce(mockBuffer2 as any)
      .mockResolvedValueOnce(mockBuffer3 as any);

    await audioService.createTrack(new ArrayBuffer(16));
    await audioService.createTrack(new ArrayBuffer(16));
    await audioService.createTrack(new ArrayBuffer(16));

    expect(audioService.getTotalTime()).toBe(10.0);
  });
});

describe('recording', () => {
  it('rejects startRecording when microphone is not open', async () => {
    // microphone.state defaults to 'stopped' in the mock
    await expect(audioService.startRecording()).rejects.toBeUndefined();
  });

  it('reports recording state', () => {
    // recorder.state defaults to 'stopped'
    expect(audioService.isRecording()).toBe(false);
  });

  it('rejects stopRecording when not recording', async () => {
    await expect(audioService.stopRecording()).rejects.toBeUndefined();
  });
});

describe('startAudio', () => {
  it('resolves when a click event fires on the element', async () => {
    const promise = AudioService.startAudio(window);
    window.dispatchEvent(new Event('click'));

    await expect(promise).resolves.toBeUndefined();
    expect(Tone.start).toHaveBeenCalled();
  });
});
