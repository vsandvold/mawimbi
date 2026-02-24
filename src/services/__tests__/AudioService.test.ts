import { vi } from 'vitest';
import * as Tone from 'tone';
import AudioService from '../AudioService';

// jsdom doesn't implement URL.createObjectURL
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
}

function mockAudioBuffer(overrides: Partial<AudioBuffer> = {}): AudioBuffer {
  const channelData = new Float32Array(100).fill(0.2);
  return {
    numberOfChannels: 1,
    length: 100,
    sampleRate: 44100,
    duration: 100 / 44100,
    getChannelData: vi.fn().mockReturnValue(channelData),
    ...overrides,
  } as unknown as AudioBuffer;
}

// Reset singleton between tests
let audioService: AudioService;

beforeEach(() => {
  // Reset singleton between tests
  Object.assign(AudioService, { instance: undefined });
  audioService = AudioService.getInstance();
  vi.mocked(Tone.context.decodeAudioData).mockResolvedValue(mockAudioBuffer());
});

describe('singleton', () => {
  it('returns the same instance', () => {
    const a = AudioService.getInstance();
    const b = AudioService.getInstance();
    expect(a).toBe(b);
  });
});

describe('createTrack', () => {
  it('decodes audio data and returns a track ID and initial volume', async () => {
    const arrayBuffer = new ArrayBuffer(16);

    const { trackId, initialVolume } =
      await audioService.createTrack(arrayBuffer);

    expect(Tone.context.decodeAudioData).toHaveBeenCalledWith(arrayBuffer);
    expect(trackId).toBeDefined();
    expect(typeof trackId).toBe('string');
    expect(typeof initialVolume).toBe('number');
  });

  it('creates a mixer channel with normalization gain', async () => {
    const createChannelSpy = vi.spyOn(audioService.mixer, 'createChannel');
    const arrayBuffer = new ArrayBuffer(16);

    const { trackId } = await audioService.createTrack(arrayBuffer);

    expect(createChannelSpy).toHaveBeenCalledWith(
      trackId,
      expect.anything(),
      expect.any(Number),
    );
  });

  it('stores the blob URL for the track', async () => {
    const arrayBuffer = new ArrayBuffer(16);

    const { trackId } = await audioService.createTrack(arrayBuffer);
    const blobUrl = audioService.retrieveBlobUrl(trackId);

    expect(blobUrl).toBeDefined();
    expect(blobUrl).toContain('blob:');
  });

  it('stores the audio buffer for the track', async () => {
    const arrayBuffer = new ArrayBuffer(16);

    const { trackId } = await audioService.createTrack(arrayBuffer);
    const audioBuffer = audioService.retrieveAudioBuffer(trackId);

    expect(audioBuffer).toBeDefined();
  });

  it('stores normalization data for undo/redo retrieval', async () => {
    const arrayBuffer = new ArrayBuffer(16);

    const { trackId, initialVolume } =
      await audioService.createTrack(arrayBuffer);

    expect(audioService.retrieveInitialVolume(trackId)).toBe(initialVolume);
    expect(typeof audioService.retrieveNormalizationGainDb(trackId)).toBe(
      'number',
    );
  });

  it('returns undefined for unknown track IDs', () => {
    expect(audioService.retrieveBlobUrl('nonexistent')).toBeUndefined();
    expect(audioService.retrieveAudioBuffer('nonexistent')).toBeUndefined();
    expect(audioService.retrieveInitialVolume('nonexistent')).toBeUndefined();
  });

  it('returns initial volume of 100 for a buffer at target RMS', async () => {
    const channelData = new Float32Array(100).fill(0.2);
    vi.mocked(Tone.context.decodeAudioData).mockResolvedValueOnce(
      mockAudioBuffer({ getChannelData: vi.fn().mockReturnValue(channelData) }),
    );

    const { initialVolume } = await audioService.createTrack(
      new ArrayBuffer(16),
    );

    expect(initialVolume).toBe(100);
  });

  it('returns initial volume below 100 for a quiet buffer', async () => {
    const channelData = new Float32Array(100).fill(0.05);
    vi.mocked(Tone.context.decodeAudioData).mockResolvedValueOnce(
      mockAudioBuffer({ getChannelData: vi.fn().mockReturnValue(channelData) }),
    );

    const { initialVolume } = await audioService.createTrack(
      new ArrayBuffer(16),
    );

    expect(initialVolume).toBeLessThan(100);
    expect(initialVolume).toBeGreaterThan(0);
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
    Object.assign(Tone.Transport, { state: 'stopped' });

    audioService.togglePlayback();

    expect(Tone.Transport.start).toHaveBeenCalled();
  });

  it('toggles from started to paused', () => {
    Object.assign(Tone.Transport, { state: 'started' });

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
    vi.mocked(Tone.context.decodeAudioData)
      .mockResolvedValueOnce(mockAudioBuffer({ duration: 5.0 }))
      .mockResolvedValueOnce(mockAudioBuffer({ duration: 10.0 }))
      .mockResolvedValueOnce(mockAudioBuffer({ duration: 3.0 }));

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

describe('overdub recording', () => {
  it('opens microphone and starts transport on startOverdubRecording', async () => {
    await audioService.startOverdubRecording();

    expect(audioService.microphone.microphone.open).toHaveBeenCalled();
    expect(Tone.Transport.start).toHaveBeenCalled();
  });

  it('connects microphone to recorder on startOverdubRecording', async () => {
    await audioService.startOverdubRecording();

    expect(audioService.microphone.microphone.connect).toHaveBeenCalled();
  });

  it('captures transport position before starting', async () => {
    Tone.Transport.seconds = 5.0;

    await audioService.startOverdubRecording();

    // The start time is captured internally; verify via stopOverdubRecording
    // which uses it for track positioning
    const createChannelSpy = vi.spyOn(audioService.mixer, 'createChannel');

    // Make recorder think it's recording
    const recorderInstance = vi.mocked(Tone.Recorder).mock.results[0].value;
    Object.assign(recorderInstance, { state: 'started' });

    await audioService.stopOverdubRecording();

    expect(createChannelSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.any(Number),
      5.0,
      expect.any(Number),
    );
  });

  it('pauses transport and stops recorder on stopOverdubRecording', async () => {
    await audioService.startOverdubRecording();

    const recorderInstance = vi.mocked(Tone.Recorder).mock.results[0].value;
    Object.assign(recorderInstance, { state: 'started' });

    await audioService.stopOverdubRecording();

    expect(Tone.Transport.pause).toHaveBeenCalled();
    expect(recorderInstance.stop).toHaveBeenCalled();
  });

  it('creates a track with latency compensation on stop', async () => {
    const createChannelSpy = vi.spyOn(audioService.mixer, 'createChannel');

    await audioService.startOverdubRecording();

    const recorderInstance = vi.mocked(Tone.Recorder).mock.results[0].value;
    Object.assign(recorderInstance, { state: 'started' });

    const { trackId, initialVolume } =
      await audioService.stopOverdubRecording();

    expect(trackId).toBeDefined();
    expect(typeof initialVolume).toBe('number');
    expect(createChannelSpy).toHaveBeenCalledWith(
      trackId,
      expect.anything(),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('closes microphone on stopOverdubRecording', async () => {
    await audioService.startOverdubRecording();

    const recorderInstance = vi.mocked(Tone.Recorder).mock.results[0].value;
    Object.assign(recorderInstance, { state: 'started' });

    await audioService.stopOverdubRecording();

    expect(audioService.microphone.microphone.close).toHaveBeenCalled();
  });

  it('reports overdub recording state', () => {
    expect(audioService.isOverdubRecording()).toBe(false);
  });
});

describe('estimateRoundTripLatency', () => {
  it('returns sum of output, base, lookAhead, and estimated input latency', () => {
    const latency = audioService.estimateRoundTripLatency();

    // outputLatency (0.01) + baseLatency (0.005) + lookAhead (0.05) +
    // one render quantum (128/44100 ≈ 0.0029)
    const expected = 0.01 + 0.005 + 0.05 + 128 / 44100;
    expect(latency).toBeCloseTo(expected);
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
