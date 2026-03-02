import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import {
  play,
  pause,
  rewind,
  resetPlaybackMachine,
  togglePlayback,
  totalTime,
  transportTime,
} from '../../services/PlaybackMachine';
import { resetRecordingMachine } from '../../services/RecordingMachine';

const mockAudioService = {
  startPlayback: vi.fn(),
  pausePlayback: vi.fn(),
  stopPlayback: vi.fn(),
  setTransportTime: vi.fn(),
};

vi.mock('../useAudioService', () => ({
  useAudioService: () => mockAudioService,
}));

// Import after mocks are set up
const { useTransportBridge } = await import('../useTransportBridge');

afterEach(() => {
  resetPlaybackMachine();
  resetRecordingMachine();
  vi.clearAllMocks();
});

it('does not call audio service on initial mount', () => {
  renderHook(() => useTransportBridge());

  expect(mockAudioService.startPlayback).not.toHaveBeenCalled();
  expect(mockAudioService.pausePlayback).not.toHaveBeenCalled();
  expect(mockAudioService.stopPlayback).not.toHaveBeenCalled();
});

it('starts playback when playbackState changes to playing', () => {
  renderHook(() => useTransportBridge());

  play();

  expect(mockAudioService.startPlayback).toHaveBeenCalledTimes(1);
  expect(mockAudioService.startPlayback).toHaveBeenCalledWith();
});

it('pauses playback when playbackState changes to paused', () => {
  play();

  renderHook(() => useTransportBridge());
  vi.clearAllMocks();

  pause();

  expect(mockAudioService.pausePlayback).toHaveBeenCalledTimes(1);
  expect(mockAudioService.pausePlayback).toHaveBeenCalledWith();
});

it('stops playback when playbackState changes to stopped via rewind', () => {
  play();

  renderHook(() => useTransportBridge());
  vi.clearAllMocks();

  rewind();

  expect(mockAudioService.stopPlayback).toHaveBeenCalledTimes(1);
  expect(mockAudioService.stopPlayback).toHaveBeenCalledWith(0);
});

it('seeks when starting playback with pending seek (end-of-playback rewind)', () => {
  transportTime.value = 10.0;
  totalTime.value = 10.0;

  renderHook(() => useTransportBridge());

  togglePlayback();

  expect(mockAudioService.startPlayback).toHaveBeenCalledWith(0);
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

  play();

  expect(mockAudioService.startPlayback).not.toHaveBeenCalled();
});
