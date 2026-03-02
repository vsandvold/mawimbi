import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import {
  isPlaying,
  isRecording,
  resetTransportSignals,
} from '../../../signals/transportSignals';
import { useCountIn } from '../workstationEffects';

const mockPrepareMicrophone = vi.fn().mockResolvedValue(undefined);
const mockCloseMicrophone = vi.fn();

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
    prepareMicrophone: mockPrepareMicrophone,
    closeMicrophone: mockCloseMicrophone,
  }),
}));

vi.mock('../../message', () => ({
  default: () => ({
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    info: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  resetTransportSignals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

it('prepares microphone when count-in starts', async () => {
  const onComplete = vi.fn();

  renderHook(({ active }) => useCountIn(active, onComplete), {
    initialProps: { active: true },
  });

  await act(async () => {});

  expect(mockPrepareMicrophone).toHaveBeenCalledOnce();
});

it('sets isPlaying and isRecording signals during count-in', async () => {
  const onComplete = vi.fn();

  renderHook(({ active }) => useCountIn(active, onComplete), {
    initialProps: { active: true },
  });

  await act(async () => {});

  expect(isPlaying.value).toBe(true);
  expect(isRecording.value).toBe(true);
});

it('returns beat numbers 1 through 4', async () => {
  const onComplete = vi.fn();

  const { result } = renderHook(
    ({ active }) => useCountIn(active, onComplete),
    { initialProps: { active: true } },
  );

  await act(async () => {});
  expect(result.current).toBe(1);

  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  expect(result.current).toBe(2);

  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  expect(result.current).toBe(3);

  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  expect(result.current).toBe(4);
});

it('calls onComplete after all beats finish', async () => {
  const onComplete = vi.fn();

  renderHook(({ active }) => useCountIn(active, onComplete), {
    initialProps: { active: true },
  });

  await act(async () => {});

  // Advance through all 4 beats (4 * 500ms)
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
  }

  expect(onComplete).toHaveBeenCalledOnce();
});

it('returns null after count-in completes', async () => {
  const onComplete = vi.fn();

  const { result } = renderHook(
    ({ active }) => useCountIn(active, onComplete),
    { initialProps: { active: true } },
  );

  await act(async () => {});

  for (let i = 0; i < 4; i++) {
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
  }

  expect(result.current).toBe(null);
});

it('cleans up microphone and signals when cancelled', async () => {
  const onComplete = vi.fn();

  const { rerender } = renderHook(
    ({ active }) => useCountIn(active, onComplete),
    { initialProps: { active: true } },
  );

  await act(async () => {});

  // Cancel during count-in
  rerender({ active: false });

  expect(mockCloseMicrophone).toHaveBeenCalledOnce();
  expect(isPlaying.value).toBe(false);
  expect(isRecording.value).toBe(false);
  expect(onComplete).not.toHaveBeenCalled();
});

it('does not clean up microphone when count-in completes normally', async () => {
  const onComplete = vi.fn();

  const { rerender } = renderHook(
    ({ active }) => useCountIn(active, onComplete),
    { initialProps: { active: true } },
  );

  await act(async () => {});

  // Let count-in complete
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
  }

  expect(onComplete).toHaveBeenCalledOnce();

  // onComplete sets isCountingIn to false, simulated by rerender
  rerender({ active: false });

  // Microphone should NOT be closed — recording will take it over
  expect(mockCloseMicrophone).not.toHaveBeenCalled();
});

it('returns null when not counting in', () => {
  const onComplete = vi.fn();

  const { result } = renderHook(
    ({ active }) => useCountIn(active, onComplete),
    { initialProps: { active: false } },
  );

  expect(result.current).toBe(null);
});
