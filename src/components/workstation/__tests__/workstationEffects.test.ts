import { fireEvent } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import {
  resetTransportSignals,
  isPlaying,
  isRecording,
  transportTime,
} from '../../../signals/transportSignals';
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

vi.mock('../../project/useProjectDispatch', () => ({
  default: () => vi.fn(),
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
  resetTransportSignals();
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
    isRecording.value = true;

    renderHook(() => useSpacebarPlaybackToggle());

    fireEvent.keyUp(window, { key: ' ', code: 'Space' });

    expect(isPlaying.value).toBe(false);
  });
});

describe('useMicrophone', () => {
  it('sets isPlaying and isRecording signals when recording starts', async () => {
    renderHook(({ isRec }: { isRec: boolean }) => useMicrophone(isRec), {
      initialProps: { isRec: true },
    });

    await act(async () => {});

    expect(isRecording.value).toBe(true);
    expect(isPlaying.value).toBe(true);
  });

  it('clears isPlaying and isRecording signals when recording stops', async () => {
    const { rerender } = renderHook(
      ({ isRec }: { isRec: boolean }) => useMicrophone(isRec),
      { initialProps: { isRec: true } },
    );
    await act(async () => {});

    rerender({ isRec: false });
    await act(async () => {});

    expect(isRecording.value).toBe(false);
    expect(isPlaying.value).toBe(false);
  });

  it('rewinds transport to the beginning after recording stops', async () => {
    transportTime.value = 99;

    const { rerender } = renderHook(
      ({ isRec }: { isRec: boolean }) => useMicrophone(isRec),
      { initialProps: { isRec: true } },
    );
    await act(async () => {});

    // Stop recording
    rerender({ isRec: false });
    await act(async () => {});

    // transportTime should rewind to 0 so the user can play everything
    // from the beginning after recording
    expect(transportTime.value).toBe(0);
  });

  it('rewinds transport to the beginning even for mid-session recordings', async () => {
    transportTime.value = 99;

    const { rerender } = renderHook(
      ({ isRec }: { isRec: boolean }) => useMicrophone(isRec),
      { initialProps: { isRec: true } },
    );
    await act(async () => {});

    // Stop recording
    rerender({ isRec: false });
    await act(async () => {});

    // transportTime should rewind to 0 so the user can play everything
    // from the beginning, regardless of where recording started
    expect(transportTime.value).toBe(0);
  });
});
