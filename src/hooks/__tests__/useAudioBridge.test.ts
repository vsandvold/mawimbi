import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { TrackSignalStore } from '../../signals/trackSignals';
import { resetAllSignals } from '../../signals/__tests__/testUtils';

const mockChannel = {
  mute: false,
  solo: false,
  volume: 100,
  dispose: vi.fn(),
};

vi.mock('../useAudioService', () => ({
  useAudioService: () => ({
    mixer: {
      retrieveChannel: vi.fn().mockReturnValue(mockChannel),
    },
  }),
}));

// Import after mocks are set up
const { useAudioBridge } = await import('../useAudioBridge');

afterEach(() => {
  resetAllSignals();
  mockChannel.volume = 100;
});

it('sets channel volume when volume signal changes', async () => {
  TrackSignalStore.create('track-1');

  renderHook(() => useAudioBridge(['track-1']));

  const signals = TrackSignalStore.get('track-1')!;
  signals.volume.value = 75;

  expect(mockChannel.volume).toBe(75);
});

it('handles multiple tracks', () => {
  TrackSignalStore.create('track-1');
  TrackSignalStore.create('track-2');

  renderHook(() => useAudioBridge(['track-1', 'track-2']));

  TrackSignalStore.get('track-1')!.volume.value = 50;
  expect(mockChannel.volume).toBe(50);

  TrackSignalStore.get('track-2')!.volume.value = 25;
  expect(mockChannel.volume).toBe(25);
});

it('does not crash when track signals do not exist', () => {
  expect(() => {
    renderHook(() => useAudioBridge(['nonexistent']));
  }).not.toThrow();
});

it('disposes effects on unmount', () => {
  TrackSignalStore.create('track-1');

  const { unmount } = renderHook(() => useAudioBridge(['track-1']));

  unmount();

  // After unmount, changing the signal should not affect the channel
  // since the effect was disposed. Reset volume to verify.
  mockChannel.volume = 100;
  TrackSignalStore.get('track-1')!.volume.value = 0;
  expect(mockChannel.volume).toBe(100);
});
