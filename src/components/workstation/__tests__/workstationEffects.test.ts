import { fireEvent } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import * as Tone from 'tone';
import AudioService from '../../../services/AudioService';
import { mockTrack } from '../../../testUtils';
import {
  useClassificationErrors,
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

const { mockError, mockSuccess, mockLoading, mockInfo } = vi.hoisted(() => ({
  mockError: vi.fn(),
  mockSuccess: vi.fn(),
  mockLoading: vi.fn(),
  mockInfo: vi.fn(),
}));

vi.mock('../../message', () => ({
  default: () => ({
    success: mockSuccess,
    error: mockError,
    loading: mockLoading,
    info: mockInfo,
  }),
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

describe('useClassificationErrors', () => {
  const track1 = mockTrack({ trackId: 'track-1' });

  const mockAudioBuffer = {
    numberOfChannels: 1,
    length: 100,
    sampleRate: 44100,
    getChannelData: () => new Float32Array(100),
  } as unknown as AudioBuffer;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = classificationService as any;
    vi.spyOn(service, 'classifyInWorker').mockRejectedValue(
      new Error('worker failed'),
    );
    vi.spyOn(service, 'classifyOnMainThread').mockRejectedValue(
      new Error('main thread failed'),
    );
  });

  it('shows error message when classification fails for a track', async () => {
    const { rerender } = renderHook(
      ({ tracks }) => useClassificationErrors(tracks),
      { initialProps: { tracks: [track1] } },
    );

    // Let the classify promise settle (worker fails → main-thread fails → error state)
    await act(async () => {
      await classificationService
        .classify('track-1', mockAudioBuffer)
        .catch(() => {});
    });

    rerender({ tracks: [track1] });

    expect(mockError).toHaveBeenCalledWith('Instrument detection failed');
  });

  it('does not show error message when classification succeeds', () => {
    renderHook(({ tracks }) => useClassificationErrors(tracks), {
      initialProps: { tracks: [track1] },
    });

    expect(mockError).not.toHaveBeenCalled();
  });

  it('does not show duplicate error messages for the same track', async () => {
    const { rerender } = renderHook(
      ({ tracks }) => useClassificationErrors(tracks),
      { initialProps: { tracks: [track1] } },
    );

    await act(async () => {
      await classificationService
        .classify('track-1', mockAudioBuffer)
        .catch(() => {});
    });

    rerender({ tracks: [track1] });

    // Re-render again — should not show another error
    rerender({ tracks: [track1] });

    expect(mockError).toHaveBeenCalledTimes(1);
  });
});
