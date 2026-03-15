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
});

describe('sub-services', () => {
  it('creates a PlaybackService', () => {
    expect(audioService.playbackService).toBeDefined();
    expect(audioService.playbackService.playbackState).toBe('stopped');
  });

  it('creates a RecordingService', () => {
    expect(audioService.recordingService).toBeDefined();
    expect(audioService.recordingService.recordingState).toBe('idle');
  });

  it('creates a TrackService', () => {
    expect(audioService.trackService).toBeDefined();
    expect(audioService.trackService.mutedTracks).toEqual([]);
  });

  it('creates an InstrumentClassificationService', () => {
    expect(audioService.classificationService).toBeDefined();
    expect(audioService.classificationService.classifications.size).toBe(0);
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

    await expect(promise).rejects.toThrow('not allowed');
  });
});
