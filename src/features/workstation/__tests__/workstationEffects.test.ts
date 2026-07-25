import { fireEvent } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import * as Tone from 'tone';
import AudioService from '../../audio/AudioService';
import { mockTrack } from '../../../testUtils';
import {
  useClassificationSync,
  useSpacebarPlaybackToggle,
  useMicrophone,
  useTempoSync,
} from '../workstationEffects';
import { type SpectrogramData } from '../../spectrogram/OfflineAnalyser';
import { type RhythmData } from '../../rhythm/RhythmAnalyser';

const audioService = AudioService.getInstance();
const playbackService = audioService.playbackService;
const recordingService = audioService.recordingService;
const trackService = audioService.trackService;
const classificationService = audioService.classificationService;

const mockProjectDispatch = vi.fn();
vi.mock('../../project/useProjectDispatch', () => ({
  default: () => mockProjectDispatch,
}));

vi.mock('../../project/ProjectStorageService', () => ({
  saveAudioData: vi.fn().mockResolvedValue(undefined),
}));

const { mockMessage } = vi.hoisted(() => ({
  mockMessage: vi.fn(),
}));

vi.mock('../../message', () => ({
  default: () => mockMessage,
}));

afterEach(() => {
  vi.restoreAllMocks();
  playbackService.reset();
  recordingService.reset();
  classificationService.reset();
  Tone.getTransport().seconds = 0;
  vi.clearAllMocks();
});

describe('useSpacebarPlaybackToggle', () => {
  it('toggles playback with spacebar', () => {
    renderHook(() => useSpacebarPlaybackToggle());

    expect(playbackService.isPlaying).toBe(false);

    fireEvent.keyUp(window, { key: ' ', code: 'Space' });

    expect(playbackService.isPlaying).toBe(true);
  });

  it('does not toggle playback with spacebar while recording', () => {
    recordingService.arm();
    recordingService.startRecording();

    renderHook(() => useSpacebarPlaybackToggle());

    fireEvent.keyUp(window, { key: ' ', code: 'Space' });

    expect(playbackService.isPlaying).toBe(false);
  });
});

describe('useMicrophone', () => {
  beforeEach(() => {
    // Spy on recording service async methods
    vi.spyOn(recordingService, 'startOverdubRecording').mockResolvedValue(
      undefined,
    );
    vi.spyOn(recordingService, 'stopOverdubRecording').mockResolvedValue({
      audioBuffer: {} as AudioBuffer,
      arrayBuffer: new ArrayBuffer(16),
      startTime: 0,
    });
    vi.spyOn(recordingService, 'isOverdubRecording').mockReturnValue(true);

    vi.spyOn(trackService, 'createRecordedTrack').mockReturnValue({
      trackId: 'recorded-track-1',
      initialVolume: 80,
    });
  });

  it('starts overdub recording on the audio engine', async () => {
    renderHook(({ isRec }: { isRec: boolean }) => useMicrophone(isRec), {
      initialProps: { isRec: true },
    });

    await act(async () => {});

    expect(recordingService.startOverdubRecording).toHaveBeenCalledOnce();
  });

  it('stops overdub recording and creates a track', async () => {
    const { rerender } = renderHook(
      ({ isRec }: { isRec: boolean }) => useMicrophone(isRec),
      { initialProps: { isRec: true } },
    );
    await act(async () => {});

    rerender({ isRec: false });
    await act(async () => {});

    expect(recordingService.stopOverdubRecording).toHaveBeenCalledOnce();
    expect(trackService.createRecordedTrack).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      0,
    );
    expect(mockProjectDispatch).toHaveBeenCalledWith([
      'ADD_TRACK',
      { trackId: 'recorded-track-1', fileName: 'Recording', startTime: 0 },
    ]);
  });

  it('transitions recording state to idle when recording stops', async () => {
    recordingService.arm();
    recordingService.startRecording();

    const { rerender } = renderHook(
      ({ isRec }: { isRec: boolean }) => useMicrophone(isRec),
      { initialProps: { isRec: true } },
    );
    await act(async () => {});

    rerender({ isRec: false });
    await act(async () => {});

    expect(recordingService.recordingState).toBe('idle');
  });

  it('starts playback after overdub recording begins', async () => {
    renderHook(({ isRec }: { isRec: boolean }) => useMicrophone(isRec), {
      initialProps: { isRec: true },
    });

    await act(async () => {});

    // useMicrophone calls play() after startOverdubRecording() so the
    // scrubber animation loop activates.  When recording from position 0,
    // useCountIn does not call play() (no lead-in), so this is the first
    // play() call.  When lead-in was available, play() was already called
    // by useCountIn and this is a no-op.
    expect(playbackService.isPlaying).toBe(true);
  });

  it('pauses at current position when recording stops', async () => {
    vi.spyOn(playbackService, 'getEngineTime').mockReturnValue(5.0);

    const { rerender } = renderHook(
      ({ isRec }: { isRec: boolean }) => useMicrophone(isRec),
      { initialProps: { isRec: true } },
    );
    await act(async () => {});

    rerender({ isRec: false });
    await act(async () => {});

    expect(playbackService.isPlaying).toBe(false);
    expect(playbackService.transportTime).toBe(5.0);
  });
});

describe('useClassificationSync', () => {
  const track1 = mockTrack({ trackId: 'track-1' });

  const mockAudioBuffer = {
    numberOfChannels: 1,
    length: 132300,
    sampleRate: 44100,
    duration: 3,
    getChannelData: () => new Float32Array(132300),
  } as unknown as AudioBuffer;

  it('dispatches SET_INSTRUMENT when classification completes', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = classificationService as any;
    vi.spyOn(service, 'classifyInWorker').mockResolvedValue({
      label: 'voice',
      score: 0.93,
    });

    const { rerender } = renderHook(
      ({ tracks }) => useClassificationSync(tracks),
      { initialProps: { tracks: [track1] } },
    );

    await act(async () => {
      await classificationService.classify('track-1', mockAudioBuffer);
    });

    rerender({ tracks: [track1] });

    expect(mockProjectDispatch).toHaveBeenCalledWith([
      'SET_INSTRUMENT',
      { trackId: 'track-1', instrument: 'vocals' },
    ]);
  });

  it('does not dispatch when classification is not done', () => {
    renderHook(({ tracks }) => useClassificationSync(tracks), {
      initialProps: { tracks: [track1] },
    });

    expect(mockProjectDispatch).not.toHaveBeenCalledWith(
      expect.arrayContaining(['SET_INSTRUMENT']),
    );
  });

  it('does not dispatch duplicate SET_INSTRUMENT for the same track', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = classificationService as any;
    vi.spyOn(service, 'classifyInWorker').mockResolvedValue({
      label: 'voice',
      score: 0.93,
    });

    const { rerender } = renderHook(
      ({ tracks }) => useClassificationSync(tracks),
      { initialProps: { tracks: [track1] } },
    );

    await act(async () => {
      await classificationService.classify('track-1', mockAudioBuffer);
    });

    rerender({ tracks: [track1] });
    rerender({ tracks: [track1] });

    const instrumentCalls = mockProjectDispatch.mock.calls.filter(
      (call) => call[0]?.[0] === 'SET_INSTRUMENT',
    );
    expect(instrumentCalls).toHaveLength(1);
  });

  // A track that already carries a label got it from the user's dropdown or
  // from a previous session's persisted state. Classification fills an empty
  // field; it never overrules one that is already set.
  it('does not overwrite an instrument the track already has', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = classificationService as any;
    vi.spyOn(service, 'classifyInWorker').mockResolvedValue({
      label: 'guitar',
      score: 0.7,
    });

    const track = mockTrack({ trackId: 'track-1', instrument: 'drums' });

    const { rerender } = renderHook(
      ({ tracks }) => useClassificationSync(tracks),
      { initialProps: { tracks: [track] } },
    );

    await act(async () => {
      await classificationService.classify('track-1', mockAudioBuffer);
    });

    rerender({ tracks: [track] });

    const instrumentCalls = mockProjectDispatch.mock.calls.filter(
      (call) => call[0]?.[0] === 'SET_INSTRUMENT',
    );
    expect(instrumentCalls).toEqual([]);
  });
});

describe('useTempoSync', () => {
  const spectrogramCache = audioService.spectrogramCache;
  const rhythm: RhythmData = {
    bpm: 119.84,
    confidence: 3.77,
    ticks: [0.5, 1.0],
    onsets: [0.02, 0.51],
  };

  const spectrogramData: SpectrogramData = {
    frequencyFrames: [],
    timeResolution: 0.01,
    frequencyBinCount: 128,
    sampleRate: 44100,
    duration: 2,
    totalFrames: 0,
  };

  // The cache is a singleton on the AudioService — a track left behind by
  // one test would make the next one's initial sync fire for the wrong data.
  afterEach(() => spectrogramCache.invalidateAll());

  const cacheTrack = (trackId: string) =>
    spectrogramCache.setEntry(trackId, spectrogramData, []);

  const tempoCalls = () =>
    mockProjectDispatch.mock.calls.filter(
      (call) => call[0]?.[0] === 'SET_TRACK_TEMPO',
    );

  it('dispatches SET_TRACK_TEMPO for rhythm already cached at mount', () => {
    cacheTrack('track-1');
    spectrogramCache.setRhythm('track-1', rhythm);

    renderHook(({ tracks }) => useTempoSync(tracks), {
      initialProps: { tracks: [mockTrack({ trackId: 'track-1' })] },
    });

    expect(mockProjectDispatch).toHaveBeenCalledWith([
      'SET_TRACK_TEMPO',
      { trackId: 'track-1', tempo: { bpm: 119.84, confidence: 3.77 } },
    ]);
  });

  it('dispatches when rhythm analysis lands after mount', () => {
    cacheTrack('track-1');

    renderHook(({ tracks }) => useTempoSync(tracks), {
      initialProps: { tracks: [mockTrack({ trackId: 'track-1' })] },
    });
    expect(tempoCalls()).toHaveLength(0);

    // Nothing re-renders the workstation when a worker round-trip resolves,
    // so this only works through the cache's own subscription.
    act(() => spectrogramCache.setRhythm('track-1', rhythm));

    expect(tempoCalls()).toHaveLength(1);
  });

  it('does not re-dispatch a tempo the track already carries', () => {
    cacheTrack('track-1');
    spectrogramCache.setRhythm('track-1', rhythm);
    const track = mockTrack({
      trackId: 'track-1',
      tempo: { bpm: rhythm.bpm, confidence: rhythm.confidence },
    });

    const { rerender } = renderHook(({ tracks }) => useTempoSync(tracks), {
      initialProps: { tracks: [track] },
    });
    rerender({ tracks: [track] });

    expect(tempoCalls()).toHaveLength(0);
  });

  it('never dispatches a non-finite estimate', () => {
    // The already-synced guard compares with `===`, which is always false
    // for NaN — dispatching one would re-enter the effect through the new
    // `tracks` array and dispatch again without end, freezing the tab
    // rather than showing a wrong number (`/code-review` on #559).
    cacheTrack('track-1');
    const track = mockTrack({ trackId: 'track-1' });

    const { rerender } = renderHook(({ tracks }) => useTempoSync(tracks), {
      initialProps: { tracks: [track] },
    });
    act(() =>
      spectrogramCache.setRhythm('track-1', { ...rhythm, bpm: Number.NaN }),
    );
    // Stands in for the re-render a dispatch would have caused: if one had
    // slipped through, this is the iteration that would dispatch again.
    rerender({ tracks: [track] });

    expect(tempoCalls()).toHaveLength(0);
  });

  it('does not write back a tempo for a track deleted mid-analysis', () => {
    cacheTrack('track-1');
    cacheTrack('track-2');
    const surviving = mockTrack({ trackId: 'track-2' });

    const { rerender } = renderHook(({ tracks }) => useTempoSync(tracks), {
      initialProps: { tracks: [mockTrack({ trackId: 'track-1' }), surviving] },
    });

    // The user deletes track-1 while the worker is still running; both
    // analyses then resolve, one against a track the project no longer has.
    rerender({ tracks: [surviving] });
    act(() => {
      spectrogramCache.setRhythm('track-1', rhythm);
      spectrogramCache.setRhythm('track-2', rhythm);
    });

    // track-2's dispatch is the positive control: without it, "no dispatch
    // for track-1" would also pass if nothing were listening at all.
    expect(tempoCalls().map((call) => call[0][1].trackId)).toEqual(['track-2']);
  });
});
