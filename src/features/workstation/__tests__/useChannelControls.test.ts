import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { getFocusedTracks } from '../../tracks/focusSignals';
import AudioService from '../../audio/AudioService';
import { resetAllSignals } from '../../tracks/__tests__/testUtils';
import { useChannelControls } from '../useChannelControls';

const trackService = AudioService.getInstance().trackService;

beforeAll(() => {
  vi.useFakeTimers();
});

beforeEach(() => {
  trackService.createSignals('track-1');
});

afterEach(() => {
  vi.clearAllTimers();
  resetAllSignals();
});

afterAll(() => {
  vi.useRealTimers();
});

describe('useChannelControls', () => {
  describe('startFocus / endFocus', () => {
    it('focuses the track on start and unfocuses on end', () => {
      const { result } = renderHook(() => useChannelControls('track-1'));

      result.current.startFocus();
      expect(getFocusedTracks()).toContain('track-1');

      result.current.endFocus();
      expect(getFocusedTracks()).not.toContain('track-1');
    });

    it('keeps the track focused while the pointer stays down', () => {
      const { result } = renderHook(() => useChannelControls('track-1'));

      result.current.startFocus();
      result.current.updateVolume(80);
      vi.advanceTimersByTime(250);

      expect(getFocusedTracks()).toContain('track-1');
    });
  });

  describe('updateVolume', () => {
    it('writes the volume signal without touching focus', () => {
      // Focus is pointer-driven only — a value change (e.g. from the
      // keyboard) must not focus, because no pointerup would ever clear it
      // (the stuck-focus bug: Radix fires no commit without a value change).
      const { result } = renderHook(() => useChannelControls('track-1'));

      result.current.updateVolume(80);

      expect(trackService.getSignals('track-1')!.volume.value).toBe(80);
      expect(getFocusedTracks()).not.toContain('track-1');
    });
  });
});
