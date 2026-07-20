import { renderHook } from '@testing-library/react';
import { getFocusedTracks } from '../../tracks/focusSignals';
import AudioService from '../../audio/AudioService';
import { resetAllSignals } from '../../tracks/__tests__/testUtils';
import { useChannelControls } from '../useChannelControls';

const trackService = AudioService.getInstance().trackService;

beforeEach(() => {
  trackService.createSignals('track-1');
});

afterEach(() => {
  resetAllSignals();
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

    it('unfocuses on unmount while the pointer is still down', () => {
      // The channel can unmount mid-press (sheet closed via a
      // keyboard-activated toggle, track removed) — pointerup then never
      // bubbles to the wrapper, so the hook itself must clean up or the
      // focus sticks forever.
      const { result, unmount } = renderHook(() =>
        useChannelControls('track-1'),
      );

      result.current.startFocus();
      unmount();

      expect(getFocusedTracks()).not.toContain('track-1');
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
