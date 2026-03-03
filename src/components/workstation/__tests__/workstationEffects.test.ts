import { fireEvent } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import * as Tone from 'tone';
import AudioService from '../../../services/AudioService';
import {
  useSpacebarPlaybackToggle,
  useMicrophone,
} from '../workstationEffects';

const audioService = AudioService.getInstance();
const playbackService = audioService.playbackService;
const recordingService = audioService.recordingService;
const trackService = audioService.trackService;

const mockProjectDispatch = vi.fn();
vi.mock('../../project/useProjectDispatch', () => ({
  default: () => mockProjectDispatch,
}));

vi.mock('../../message', () => ({
  default: () => ({
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    info: vi.fn(),
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  playbackService.reset();
  recordingService.reset();
  Tone.getTransport().seconds = 0;
  vi.clearAllMocks();
});

describe('useSpacebarPlaybackToggle', () => {
  it('toggles playback with spacebar', () => {
    renderHook(() => useSpacebarPlaybackToggle());

    expect(playbackService.isPlaying.value).toBe(false);

    fireEvent.keyUp(window, { key: ' ', code: 'Space' });

    expect(playbackService.isPlaying.value).toBe(true);
  });

  it('does not toggle playback with spacebar while recording', () => {
    recordingService.arm();
    recordingService.startRecording();

    renderHook(() => useSpacebarPlaybackToggle());

    fireEvent.keyUp(window, { key: ' ', code: 'Space' });

    expect(playbackService.isPlaying.value).toBe(false);
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
      latencyCompensation: 0.05,
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
      0.05,
    );
    expect(mockProjectDispatch).toHaveBeenCalledWith([
      'ADD_TRACK',
      { trackId: 'recorded-track-1', fileName: 'Recording' },
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

    expect(recordingService.recordingState.value).toBe('idle');
  });

  it('does not start playback when recording starts', async () => {
    renderHook(({ isRec }: { isRec: boolean }) => useMicrophone(isRec), {
      initialProps: { isRec: true },
    });

    await act(async () => {});

    // Count-in handles playback start, not useMicrophone
    expect(playbackService.isPlaying.value).toBe(false);
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

    expect(playbackService.isPlaying.value).toBe(false);
    expect(playbackService.transportTime.value).toBe(5.0);
  });
});
