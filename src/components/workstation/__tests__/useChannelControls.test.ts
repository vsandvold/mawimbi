import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { focusedTracks } from '../../../signals/focusSignals';
import AudioService from '../../../services/AudioService';
import { resetAllSignals } from '../../../signals/__tests__/testUtils';
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
    it('unfocuses track immediately when slider is released', () => {
      const { result } = renderHook(() => useChannelControls('track-1'));

      result.current.updateVolume(80);
      result.current.commitVolume();

      expect(focusedTracks.value).not.toContain('track-1');
    });
  });
});
