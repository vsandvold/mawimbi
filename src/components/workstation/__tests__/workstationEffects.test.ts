import { fireEvent } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { resetPlaybackMachine } from '../../../services/PlaybackMachine';
import {
  arm,
  resetRecordingMachine,
  startRecording,
} from '../../../services/RecordingMachine';
import {
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
  resetPlaybackMachine();
  resetRecordingMachine();
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
  it('sets isPlaying when recording starts', async () => {
    renderHook(({ isRec }: { isRec: boolean }) => useMicrophone(isRec), {
      initialProps: { isRec: true },
    });

    await act(async () => {});

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

  it('pauses at current position after recording stops', async () => {
    transportTime.value = 99;
    mockGetTransportTime.mockReturnValue(5.0);

    const { rerender } = renderHook(
      ({ isRec }: { isRec: boolean }) => useMicrophone(isRec),
      { initialProps: { isRec: true } },
    );
    await act(async () => {});

    // Stop recording
    rerender({ isRec: false });
    await act(async () => {});

    // transportTime should be set to the transport's current position
    // (returned by getTransportTime), not rewound to 0
    expect(transportTime.value).toBe(5.0);
  });
});
