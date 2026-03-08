import { fireEvent } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import * as Tone from 'tone';
import AudioService from '../../../services/AudioService';
import { mockTrack } from '../../../testUtils';
import {
  useClassificationSync,
  useSpacebarPlaybackToggle,
  useMicrophone,
} from '../workstationEffects';

const audioService = AudioService.getInstance();
const playbackService = audioService.playbackService;
const recordingService = audioService.recordingService;
const trackService = audioService.trackService;
const classificationService = audioService.classificationService;

const mockProjectDispatch = vi.fn();
vi.mock('../../project/useProjectDispatch', () => ({
  default: () => mockProjectDispatch,
}));

vi.mock('../../../services/ProjectStorageService', () => ({
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
});
