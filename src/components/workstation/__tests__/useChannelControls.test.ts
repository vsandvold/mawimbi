import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { focusedTracks } from '../../../signals/focusSignals';
import { TrackSignalStore } from '../../../signals/trackSignals';
import { resetAllSignals } from '../../../signals/__tests__/testUtils';
import { useChannelControls } from '../useChannelControls';

vi.mock('../../../hooks/useAudioService', () => ({
  useAudioService: () => ({
    mixer: {
      retrieveChannel: vi.fn().mockReturnValue({
        mute: false,
        solo: false,
        volume: 100,
        dispose: vi.fn(),
      }),
    },
  }),
}));

beforeAll(() => {
  vi.useFakeTimers();
});

beforeEach(() => {
  TrackSignalStore.create('track-1');
});

afterEach(() => {
  vi.clearAllTimers();
  resetAllSignals();
});

afterAll(() => {
  vi.useRealTimers();
});

describe('useChannelControls', () => {
  describe('updateVolume', () => {
    it('focuses track while volume is being changed', () => {
      const { result } = renderHook(() => useChannelControls('track-1'));

      result.current.updateVolume(80);

      expect(focusedTracks.value).toContain('track-1');
    });

    it('keeps track focused after volume stops changing', () => {
      const { result } = renderHook(() => useChannelControls('track-1'));

      result.current.updateVolume(80);

      vi.advanceTimersByTime(250);

      expect(focusedTracks.value).toContain('track-1');
    });
  });

  describe('commitVolume', () => {
    it('unfocuses track after debounce period', () => {
      const { result } = renderHook(() => useChannelControls('track-1'));

      result.current.updateVolume(80);
      result.current.commitVolume();

      vi.advanceTimersByTime(250);

      expect(focusedTracks.value).not.toContain('track-1');
    });
  });
});
