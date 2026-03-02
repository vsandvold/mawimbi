import { fireEvent } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { resetPlaybackService } from '../../../services/PlaybackService';
import {
  arm,
  recordingState,
  resetRecordingService,
  startRecording,
} from '../../../services/RecordingService';
import { transportTime } from '../../../services/PlaybackService';
import { isPlaying } from '../../../signals/transportSignals';
import { TrackSignalStore } from '../../../signals/trackSignals';
import {
  useSpacebarPlaybackToggle,
  useMicrophone,
} from '../workstationEffects';

const mockStartOverdubRecording = vi.fn().mockResolvedValue(undefined);
const mockStopOverdubRecording = vi.fn().mockResolvedValue({
  trackId: 'recorded-track-1',
  initialVolume: 80,
});
const mockIsOverdubRecording = vi.fn().mockReturnValue(true);
const mockGetTransportTime = vi.fn().mockReturnValue(0);

vi.mock('../../../services/AudioService', () => ({
  default: {
    getInstance: vi.fn().mockReturnValue({
      startPlayback: vi.fn(),
      pausePlayback: vi.fn(),
      setTransportTime: vi.fn(),
      mixer: { getMutedChannels: vi.fn().mockReturnValue([]) },
    }),
  },
}));

vi.mock('../../../hooks/useAudioService', () => ({
  useAudioService: () => ({
    startOverdubRecording: mockStartOverdubRecording,
    stopOverdubRecording: mockStopOverdubRecording,
    isOverdubRecording: mockIsOverdubRecording,
    getTransportTime: mockGetTransportTime,
  }),
}));

const mockProjectDispatch = vi.fn();
vi.mock('../../project/useProjectDispatch', () => ({
  default: () => mockProjectDispatch,
}));

vi.mock('../../../signals/trackSignals', () => ({
  TrackSignalStore: {
    create: vi.fn(),
  },
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
  resetPlaybackService();
  resetRecordingService();
  vi.clearAllMocks();
});

describe('useSpacebarPlaybackToggle', () => {
  it('toggles playback with spacebar', () => {
    renderHook(() => useSpacebarPlaybackToggle());

    expect(isPlaying.value).toBe(false);

    fireEvent.keyUp(window, { key: ' ', code: 'Space' });

    expect(isPlaying.value).toBe(true);
  });

  it('does not toggle playback with spacebar while recording', () => {
    arm();
    startRecording();

    renderHook(() => useSpacebarPlaybackToggle());

    fireEvent.keyUp(window, { key: ' ', code: 'Space' });

    expect(isPlaying.value).toBe(false);
  });
});

describe('useMicrophone', () => {
  it('starts overdub recording on the audio engine', async () => {
    renderHook(({ isRec }: { isRec: boolean }) => useMicrophone(isRec), {
      initialProps: { isRec: true },
    });

    await act(async () => {});

    expect(mockStartOverdubRecording).toHaveBeenCalledOnce();
  });

  it('stops overdub recording and creates a track', async () => {
    const { rerender } = renderHook(
      ({ isRec }: { isRec: boolean }) => useMicrophone(isRec),
      { initialProps: { isRec: true } },
    );
    await act(async () => {});

    rerender({ isRec: false });
    await act(async () => {});

    expect(mockStopOverdubRecording).toHaveBeenCalledOnce();
    expect(TrackSignalStore.create).toHaveBeenCalledWith(
      'recorded-track-1',
      80,
    );
    expect(mockProjectDispatch).toHaveBeenCalledWith([
      'ADD_TRACK',
      { trackId: 'recorded-track-1', fileName: 'Recording' },
    ]);
  });

  it('transitions recording state to idle when recording stops', async () => {
    arm();
    startRecording();

    const { rerender } = renderHook(
      ({ isRec }: { isRec: boolean }) => useMicrophone(isRec),
      { initialProps: { isRec: true } },
    );
    await act(async () => {});

    rerender({ isRec: false });
    await act(async () => {});

    expect(recordingState.value).toBe('idle');
  });

  it('does not start playback when recording starts', async () => {
    renderHook(({ isRec }: { isRec: boolean }) => useMicrophone(isRec), {
      initialProps: { isRec: true },
    });

    await act(async () => {});

    // Count-in handles playback start, not useMicrophone
    expect(isPlaying.value).toBe(false);
  });

  it('pauses at current position when recording stops', async () => {
    mockGetTransportTime.mockReturnValue(5.0);

    const { rerender } = renderHook(
      ({ isRec }: { isRec: boolean }) => useMicrophone(isRec),
      { initialProps: { isRec: true } },
    );
    await act(async () => {});

    rerender({ isRec: false });
    await act(async () => {});

    expect(isPlaying.value).toBe(false);
    expect(transportTime.value).toBe(5.0);
  });
});
