import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import {
  isPlaying,
  resetTransportSignals,
  stopAndRewindPlayback,
  togglePlayback,
  transportTime,
  totalTime,
} from '../../signals/transportSignals';

const mockAudioService = {
  startPlayback: vi.fn(),
  pausePlayback: vi.fn(),
  setTransportTime: vi.fn(),
};

vi.mock('../useAudioService', () => ({
  useAudioService: () => mockAudioService,
}));

// Import after mocks are set up
const { useTransportBridge } = await import('../useTransportBridge');

afterEach(() => {
  resetTransportSignals();
  vi.clearAllMocks();
});

it('does not call audio service on initial mount', () => {
  renderHook(() => useTransportBridge());

  expect(mockAudioService.startPlayback).not.toHaveBeenCalled();
  expect(mockAudioService.pausePlayback).not.toHaveBeenCalled();
});

it('starts playback when isPlaying changes to true', () => {
  renderHook(() => useTransportBridge());

  isPlaying.value = true;

  expect(mockAudioService.startPlayback).toHaveBeenCalledTimes(1);
  expect(mockAudioService.startPlayback).toHaveBeenCalledWith();
});

it('pauses playback when isPlaying changes to false', () => {
  isPlaying.value = true;

  renderHook(() => useTransportBridge());
  vi.clearAllMocks();

  isPlaying.value = false;

  expect(mockAudioService.pausePlayback).toHaveBeenCalledTimes(1);
  expect(mockAudioService.pausePlayback).toHaveBeenCalledWith();
});

it('seeks when starting playback with pending seek (end-of-playback rewind)', () => {
  transportTime.value = 10.0;
  totalTime.value = 10.0;

  renderHook(() => useTransportBridge());

  togglePlayback();

  expect(mockAudioService.startPlayback).toHaveBeenCalledWith(0);
});

it('seeks when stopping with pending seek (stop and rewind)', () => {
  isPlaying.value = true;

  renderHook(() => useTransportBridge());
  vi.clearAllMocks();

  stopAndRewindPlayback();

  expect(mockAudioService.pausePlayback).toHaveBeenCalledWith(0);
});

it('does not seek on normal toggle (no pending seek)', () => {
  totalTime.value = 10;

  renderHook(() => useTransportBridge());

  togglePlayback();

  expect(mockAudioService.startPlayback).toHaveBeenCalledWith();
});

it('disposes effect on unmount', () => {
  const { unmount } = renderHook(() => useTransportBridge());

  unmount();
  vi.clearAllMocks();

  isPlaying.value = true;

  expect(mockAudioService.startPlayback).not.toHaveBeenCalled();
});
