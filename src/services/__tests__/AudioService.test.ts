import { vi } from 'vitest';
import * as Tone from 'tone';
import AudioService from '../AudioService';

// Reset singleton between tests
let audioService: AudioService;

beforeEach(() => {
  Object.assign(AudioService, { instance: undefined });
  audioService = AudioService.getInstance();
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
    const setContextOrder = vi.mocked(Tone.setContext).mock
      .invocationCallOrder[0];
    const recorderOrder = vi.mocked(Tone.Recorder).mock.invocationCallOrder[0];
    expect(setContextOrder).toBeDefined();
    expect(setContextOrder).toBeLessThan(recorderOrder);
  });
});

describe('sub-services', () => {
  it('creates a PlaybackService', () => {
    expect(audioService.playbackService).toBeDefined();
    expect(audioService.playbackService.playbackState.value).toBe('stopped');
  });

  it('creates a RecordingService', () => {
    expect(audioService.recordingService).toBeDefined();
    expect(audioService.recordingService.recordingState.value).toBe('idle');
  });

  it('creates a TrackService', () => {
    expect(audioService.trackService).toBeDefined();
    expect(audioService.trackService.mutedTracks.value).toEqual([]);
  });

  it('creates a SpectrogramCache', () => {
    expect(audioService.spectrogramCache).toBeDefined();
  });
});

describe('startAudio', () => {
  beforeEach(() => {
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

    const el = document.createElement('div');
    const promise = AudioService.startAudio(
      el as unknown as Window & typeof globalThis,
    );
    el.dispatchEvent(new Event('click'));

    await expect(promise).rejects.toBeUndefined();
  });
});
