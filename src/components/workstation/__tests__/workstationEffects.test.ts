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

  it('syncs transportTime with actual transport position after recording stops', async () => {
    // transportTime is stale — it was never updated during recording because
    // the Scrubber animation loop wasn't running (no tracks existed yet, so
    // EmptyTimeline rendered instead of Scrubber).
    transportTime.value = 99;

    // After stopOverdubRecording rewinds the transport, getTransportTime
    // returns the recording start position.
    mockGetTransportTime.mockReturnValue(0);

    const { rerender } = renderHook(
      ({ isRec }: { isRec: boolean }) => useMicrophone(isRec),
      { initialProps: { isRec: true } },
    );
    await act(async () => {});

    // Stop recording
    rerender({ isRec: false });
    await act(async () => {});

    // transportTime should be synced with the actual transport position (0),
    // not left at the stale value (99). Without this sync, togglePlayback()
    // can't correctly detect end-of-playback and won't rewind — the user
    // presses play, transport resumes from a position past the recording's
    // content, and no audio is heard.
    expect(transportTime.value).toBe(0);
  });

  it('syncs transportTime to mid-session recording start position', async () => {
    // Simulate: transportTime drifted to a stale value during recording
    transportTime.value = 99;

    // After stopOverdubRecording, the transport was rewound to 3.0
    // (the position where recording started mid-session)
    mockGetTransportTime.mockReturnValue(3.0);

    const { rerender } = renderHook(
      ({ isRec }: { isRec: boolean }) => useMicrophone(isRec),
      { initialProps: { isRec: true } },
    );
    await act(async () => {});

    // Stop recording
    rerender({ isRec: false });
    await act(async () => {});

    // transportTime should reflect the actual transport position (3.0)
    expect(transportTime.value).toBe(3.0);
  });
});
