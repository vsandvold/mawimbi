import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import * as Tone from 'tone';
import AudioService from '../../../services/AudioService';
import { useCountIn } from '../workstationEffects';

const audioService = AudioService.getInstance();
const playbackService = audioService.playbackService;
const recordingService = audioService.recordingService;

vi.mock('../../message', () => ({
  default: () => vi.fn(),
}));

let prepareMicSpy: ReturnType<typeof vi.spyOn>;
let closeMicSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  prepareMicSpy = vi
    .spyOn(recordingService, 'prepareMicrophone')
    .mockResolvedValue(undefined);
  closeMicSpy = vi
    .spyOn(recordingService, 'closeMicrophone')
    .mockImplementation(() => {});
});

afterEach(() => {
  playbackService.reset();
  recordingService.reset();
  Tone.getTransport().seconds = 0;
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('prepares microphone when count-in starts', async () => {
  const onComplete = vi.fn();

  renderHook(({ active }) => useCountIn(active, onComplete), {
    initialProps: { active: true },
  });

  await act(async () => {});

  expect(prepareMicSpy).toHaveBeenCalledOnce();
});

it('sets isPlaying and isRecording signals during count-in with full lead-in', async () => {
  Tone.getTransport().seconds = 5.0;
  const onComplete = vi.fn();

  renderHook(({ active }) => useCountIn(active, onComplete), {
    initialProps: { active: true },
  });

  await act(async () => {});

  expect(playbackService.isPlaying).toBe(true);
  expect(recordingService.isRecording).toBe(true);
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

  expect(closeMicSpy).toHaveBeenCalledOnce();
  expect(playbackService.isPlaying).toBe(false);
  expect(recordingService.isRecording).toBe(false);
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
  expect(closeMicSpy).not.toHaveBeenCalled();
});

it('returns null when not counting in', () => {
  const onComplete = vi.fn();

  const { result } = renderHook(
    ({ active }) => useCountIn(active, onComplete),
    { initialProps: { active: false } },
  );

  expect(result.current).toBe(null);
});

it('does not start playback during count-in when transport is at position 0', async () => {
  Tone.getTransport().seconds = 0;
  const onComplete = vi.fn();

  renderHook(({ active }) => useCountIn(active, onComplete), {
    initialProps: { active: true },
  });

  await act(async () => {});

  // At position 0, there is no lead-in audio available.
  // Playback should not start during count-in.
  expect(playbackService.isPlaying).toBe(false);
  expect(recordingService.isRecording).toBe(true);
  expect(recordingService.isCountingIn).toBe(true);
});

it('does not start playback after count-in completes at position 0', async () => {
  Tone.getTransport().seconds = 0;
  const onComplete = vi.fn();

  renderHook(({ active }) => useCountIn(active, onComplete), {
    initialProps: { active: true },
  });

  await act(async () => {});

  // Advance through all 4 beats (4 * 500ms = 2000ms)
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
  }

  // At position 0 there is no lead-in, so useCountIn does not call
  // play().  useMicrophone is responsible for starting playback after
  // startOverdubRecording() captures the recording start time.
  expect(playbackService.isPlaying).toBe(false);
  expect(onComplete).toHaveBeenCalledOnce();
});

it('delays playback start when lead-in is shorter than count-in duration', async () => {
  // Transport at 0.5s — only 0.5s of lead-in available (count-in is 2s)
  Tone.getTransport().seconds = 0.5;
  const onComplete = vi.fn();

  renderHook(({ active }) => useCountIn(active, onComplete), {
    initialProps: { active: true },
  });

  await act(async () => {});

  // Playback should not start immediately — it should be delayed
  // by (2.0 - 0.5) = 1.5s so the transport arrives at 0.5s when
  // the count-in ends
  expect(playbackService.isPlaying).toBe(false);

  // Advance past the delay (1500ms)
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });

  expect(playbackService.isPlaying).toBe(true);
});

it('seeks transport back by count-in duration before starting playback', async () => {
  Tone.getTransport().seconds = 5.0;
  const setEngineTimeSpy = vi.spyOn(playbackService, 'setEngineTime');
  const onComplete = vi.fn();

  renderHook(({ active }) => useCountIn(active, onComplete), {
    initialProps: { active: true },
  });

  await act(async () => {});

  // Count-in duration is 4 beats * 500ms = 2s
  expect(setEngineTimeSpy).toHaveBeenCalledWith(3.0);
});

it('clamps seek-back to zero when transport is near start', async () => {
  Tone.getTransport().seconds = 0.5;
  const setEngineTimeSpy = vi.spyOn(playbackService, 'setEngineTime');
  const onComplete = vi.fn();

  renderHook(({ active }) => useCountIn(active, onComplete), {
    initialProps: { active: true },
  });

  await act(async () => {});

  expect(setEngineTimeSpy).toHaveBeenCalledWith(0);
});

it('sets isCountingIn signal during count-in', async () => {
  const onComplete = vi.fn();

  renderHook(({ active }) => useCountIn(active, onComplete), {
    initialProps: { active: true },
  });

  await act(async () => {});

  expect(recordingService.isCountingIn).toBe(true);
});

it('clears isCountingIn signal after count-in completes', async () => {
  const onComplete = vi.fn();

  renderHook(({ active }) => useCountIn(active, onComplete), {
    initialProps: { active: true },
  });

  await act(async () => {});

  for (let i = 0; i < 4; i++) {
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
  }

  expect(recordingService.isCountingIn).toBe(false);
});

it('clears isCountingIn signal when cancelled', async () => {
  const onComplete = vi.fn();

  const { rerender } = renderHook(
    ({ active }) => useCountIn(active, onComplete),
    { initialProps: { active: true } },
  );

  await act(async () => {});
  expect(recordingService.isCountingIn).toBe(true);

  rerender({ active: false });

  expect(recordingService.isCountingIn).toBe(false);
});
