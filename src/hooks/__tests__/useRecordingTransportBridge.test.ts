import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import {
  play,
  resetPlaybackService,
  transportTime,
} from '../../services/PlaybackService';
import {
  arm,
  resetRecordingService,
  startRecording,
  stopRecording,
} from '../../services/RecordingService';
import { isPlaying } from '../../signals/transportSignals';

const mockGetTransportTime = vi.fn().mockReturnValue(3.5);

vi.mock('../useAudioService', () => ({
  useAudioService: () => ({
    getTransportTime: mockGetTransportTime,
  }),
}));

// Import after mocks are set up
const { useRecordingTransportBridge } =
  await import('../useRecordingTransportBridge');

afterEach(() => {
  resetPlaybackService();
  resetRecordingService();
  vi.clearAllMocks();
});

it('does not change playback on initial mount', () => {
  renderHook(() => useRecordingTransportBridge());

  expect(isPlaying.value).toBe(false);
});

it('pauses playback when recording stops', () => {
  arm();
  startRecording();
  play();

  renderHook(() => useRecordingTransportBridge());

  stopRecording();

  expect(isPlaying.value).toBe(false);
});

it('syncs transportTime to audio engine position when recording stops', () => {
  arm();
  startRecording();
  play();
  mockGetTransportTime.mockReturnValue(7.5);

  renderHook(() => useRecordingTransportBridge());

  stopRecording();

  expect(transportTime.value).toBe(7.5);
});

it('does not start playback when recording starts', () => {
  arm();

  renderHook(() => useRecordingTransportBridge());

  startRecording();

  // Playback is not started by the bridge — the count-in orchestrator
  // or useMicrophone handles that.
  expect(isPlaying.value).toBe(false);
});

it('does not react to arm/disarm transitions', () => {
  renderHook(() => useRecordingTransportBridge());

  arm();

  expect(isPlaying.value).toBe(false);
});

it('disposes effect on unmount', () => {
  arm();
  startRecording();
  play();

  const { unmount } = renderHook(() => useRecordingTransportBridge());

  unmount();

  stopRecording();

  // Should still be playing since bridge was unmounted
  expect(isPlaying.value).toBe(true);
});
