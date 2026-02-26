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

  it('configures Tone.Context with interactive latency and reduced lookAhead', () => {
    expect(Tone.Context).toHaveBeenCalledWith({
      latencyHint: 'interactive',
      lookAhead: 0.05,
    });
  });

  it('configures Tone.js context before creating audio nodes', () => {
    // AudioService must call Tone.setContext() before constructing Tone.js
    // nodes (Recorder, UserMedia, Meter, etc.) so they all share the same
    // context as Tone.getTransport(). Without this, nodes are created on
    // the default context while getTransport() resolves to the custom
    // context. The default context is never resumed (only the custom
    // context is), so the Recorder's MediaStreamDestination produces no
    // audio data and recordings silently fail.
    const setContextOrder = vi.mocked(Tone.setContext).mock
      .invocationCallOrder[0];
    const recorderOrder = vi.mocked(Tone.Recorder).mock.invocationCallOrder[0];
    expect(setContextOrder).toBeDefined();
    expect(setContextOrder).toBeLessThan(recorderOrder);
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
  it('starts playback via Tone.getTransport()', () => {
    audioService.startPlayback();

    expect(Tone.getTransport().start).toHaveBeenCalledTimes(1);
  });

  it('starts playback at a given transport time', () => {
    audioService.startPlayback(5.0);

    expect(Tone.getTransport().seconds).toBe(5.0);
    expect(Tone.getTransport().start).toHaveBeenCalled();
  });

  it('pauses playback via Tone.getTransport()', () => {
    audioService.pausePlayback();

    expect(Tone.getTransport().pause).toHaveBeenCalledTimes(1);
  });

  it('pauses playback and sets transport time', () => {
    audioService.pausePlayback(3.0);

    expect(Tone.getTransport().pause).toHaveBeenCalled();
    expect(Tone.getTransport().seconds).toBe(3.0);
  });

  it('stops playback via Tone.getTransport()', () => {
    audioService.stopPlayback();

    expect(Tone.getTransport().stop).toHaveBeenCalledTimes(1);
  });

  it('stops playback and sets transport time', () => {
    audioService.stopPlayback(0);

    expect(Tone.getTransport().stop).toHaveBeenCalled();
    expect(Tone.getTransport().seconds).toBe(0);
  });

  it('toggles from stopped to started', () => {
    Object.assign(Tone.getTransport(), { state: 'stopped' });

    audioService.togglePlayback();

    expect(Tone.getTransport().start).toHaveBeenCalled();
  });

  it('toggles from started to paused', () => {
    Object.assign(Tone.getTransport(), { state: 'started' });

    audioService.togglePlayback();

    expect(Tone.getTransport().pause).toHaveBeenCalled();
  });
});

describe('transport time', () => {
  it('gets transport time from Tone.getTransport()', () => {
    Tone.getTransport().seconds = 42;

    expect(audioService.getTransportTime()).toBe(42);
  });

  it('sets transport time on Tone.getTransport()', () => {
    audioService.setTransportTime(10);

    expect(Tone.getTransport().seconds).toBe(10);
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
    const openSpy = vi.spyOn(audioService.microphone, 'open');

    await audioService.startOverdubRecording();

    expect(openSpy).toHaveBeenCalled();
    expect(Tone.getTransport().start).toHaveBeenCalled();
  });

  it('connects microphone to recorder on startOverdubRecording', async () => {
    const connectSpy = vi.spyOn(audioService.microphone, 'connect');

    await audioService.startOverdubRecording();

    expect(connectSpy).toHaveBeenCalled();
  });

  it('captures transport position before starting', async () => {
    Tone.getTransport().seconds = 5.0;

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

  it('stops transport and stops recorder on stopOverdubRecording', async () => {
    await audioService.startOverdubRecording();

    const recorderInstance = vi.mocked(Tone.Recorder).mock.results[0].value;
    Object.assign(recorderInstance, { state: 'started' });

    await audioService.stopOverdubRecording();

    // Transport.stop() (not pause) ensures the next Transport.start() is a
    // fresh start rather than a resume. Synced players created after
    // Transport.pause() may not trigger on resume, because they were never
    // "playing" before the pause. Transport.stop() resets the timeline so
    // all synced players start from their scheduled positions.
    expect(Tone.getTransport().stop).toHaveBeenCalled();
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
    const closeSpy = vi.spyOn(audioService.microphone, 'close');

    await audioService.startOverdubRecording();

    const recorderInstance = vi.mocked(Tone.Recorder).mock.results[0].value;
    Object.assign(recorderInstance, { state: 'started' });

    await audioService.stopOverdubRecording();

    expect(closeSpy).toHaveBeenCalled();
  });

  it('reports overdub recording state', () => {
    expect(audioService.isOverdubRecording()).toBe(false);
  });

  it('rewinds transport to recording start time after stopping', async () => {
    // Recording starts at transport position 0
    Tone.getTransport().seconds = 0;
    await audioService.startOverdubRecording();

    const recorderInstance = vi.mocked(Tone.Recorder).mock.results[0].value;
    Object.assign(recorderInstance, { state: 'started' });

    // Transport advances during recording (simulating real playback)
    Tone.getTransport().seconds = 5.0;

    await audioService.stopOverdubRecording();

    // Transport should be rewound to the recording start time (0) so the
    // recorded track can be replayed. Without this, pressing play resumes
    // from 5.0 — past the end of the 5-second recording — producing no audio.
    expect(Tone.getTransport().seconds).toBe(0);
  });

  it('rewinds transport to mid-session recording start time after stopping', async () => {
    // User played to position 3, paused, then started recording
    Tone.getTransport().seconds = 3.0;
    await audioService.startOverdubRecording();

    const recorderInstance = vi.mocked(Tone.Recorder).mock.results[0].value;
    Object.assign(recorderInstance, { state: 'started' });

    // Transport advances during recording
    Tone.getTransport().seconds = 8.0;

    await audioService.stopOverdubRecording();

    // Transport should rewind to 3.0 (recording start), not stay at 8.0
    expect(Tone.getTransport().seconds).toBe(3.0);
  });

  it('stores a retrievable blobUrl for the recorded track', async () => {
    await audioService.startOverdubRecording();

    const recorderInstance = vi.mocked(Tone.Recorder).mock.results[0].value;
    Object.assign(recorderInstance, { state: 'started' });

    const { trackId } = await audioService.stopOverdubRecording();
    const blobUrl = audioService.retrieveBlobUrl(trackId);

    expect(blobUrl).toBeDefined();
    expect(blobUrl).toContain('blob:');
  });

  it('stores a retrievable audioBuffer for the recorded track', async () => {
    await audioService.startOverdubRecording();

    const recorderInstance = vi.mocked(Tone.Recorder).mock.results[0].value;
    Object.assign(recorderInstance, { state: 'started' });

    const { trackId } = await audioService.stopOverdubRecording();
    const audioBuffer = audioService.retrieveAudioBuffer(trackId);

    expect(audioBuffer).toBeDefined();
  });

  it('includes recorded track duration in total time', async () => {
    vi.mocked(Tone.context.decodeAudioData).mockResolvedValueOnce(
      mockAudioBuffer({ duration: 5.0 }),
    );

    await audioService.startOverdubRecording();

    const recorderInstance = vi.mocked(Tone.Recorder).mock.results[0].value;
    Object.assign(recorderInstance, { state: 'started' });

    await audioService.stopOverdubRecording();

    expect(audioService.getTotalTime()).toBe(5.0);
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
  beforeEach(() => {
    // Reset context state to 'suspended' before each startAudio test,
    // mirroring a freshly created AudioContext that hasn't been resumed yet.
    Object.assign(Tone.context, { state: 'suspended' });
  });

  it('resolves when a click event fires on the element', async () => {
    const promise = AudioService.startAudio(window);
    window.dispatchEvent(new Event('click'));

    await expect(promise).resolves.toBeUndefined();
    expect(Tone.start).toHaveBeenCalled();
  });

  it('transitions context from suspended to running', async () => {
    expect(Tone.context.state).toBe('suspended');

    const promise = AudioService.startAudio(window);
    window.dispatchEvent(new Event('click'));
    await promise;

    expect(Tone.context.state).toBe('running');
  });

  it('rejects when Tone.start() fails', async () => {
    vi.mocked(Tone.start).mockImplementationOnce(() =>
      Promise.reject(new Error('not allowed')),
    );

    // Use a fresh element to avoid stale listeners from earlier tests
    // (startAudioContext.bind() creates a new reference, so
    // removeEventListener with the original reference is a no-op).
    const el = document.createElement('div');
    const promise = AudioService.startAudio(el as unknown as Window);
    el.dispatchEvent(new Event('click'));

    await expect(promise).rejects.toBeUndefined();
  });
});
