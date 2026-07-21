import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import React from 'react';
import { getFocusedTracks } from '../../tracks/focusSignals';
import AudioService from '../../audio/AudioService';
import { resetAllSignals } from '../../tracks/__tests__/testUtils';
import {
  SET_TRACK_MUTE_SOLO,
  SET_TRACK_VOLUME,
} from '../../project/projectPageReducer';
import { ProjectDispatch } from '../../project/useProjectDispatch';
import { useChannelControls } from '../useChannelControls';

const trackService = AudioService.getInstance().trackService;

function withDispatch(dispatch: (action: unknown) => void) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      ProjectDispatch.Provider,
      // The context type is React.Dispatch<ProjectAction>; tests only
      // assert on the calls, so a loosely-typed spy is fine here.
      { value: dispatch as never },
      children,
    );
}

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

    it('does not dispatch', () => {
      const dispatch = vi.fn();
      const { result } = renderHook(() => useChannelControls('track-1'), {
        wrapper: withDispatch(dispatch),
      });

      result.current.updateVolume(80);

      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe('commitVolume', () => {
    it('dispatches SET_TRACK_VOLUME with the committed value', () => {
      const dispatch = vi.fn();
      const { result } = renderHook(() => useChannelControls('track-1'), {
        wrapper: withDispatch(dispatch),
      });

      result.current.commitVolume(65);

      expect(dispatch).toHaveBeenCalledWith([
        SET_TRACK_VOLUME,
        { trackId: 'track-1', volume: 65 },
      ]);
    });
  });

  describe('uncommitted-drag safety net', () => {
    it('commits a live but uncommitted volume on unmount', () => {
      const dispatch = vi.fn();
      const { result, unmount } = renderHook(
        () => useChannelControls('track-1'),
        { wrapper: withDispatch(dispatch) },
      );

      result.current.updateVolume(33);
      unmount();

      expect(dispatch).toHaveBeenCalledWith([
        SET_TRACK_VOLUME,
        { trackId: 'track-1', volume: 33 },
      ]);
    });

    it('does not re-dispatch on unmount once the volume was already committed', () => {
      const dispatch = vi.fn();
      const { result, unmount } = renderHook(
        () => useChannelControls('track-1'),
        { wrapper: withDispatch(dispatch) },
      );

      result.current.updateVolume(33);
      result.current.commitVolume(33);
      dispatch.mockClear();
      unmount();

      expect(dispatch).not.toHaveBeenCalled();
    });

    it('does not dispatch on unmount when volume was never touched', () => {
      const dispatch = vi.fn();
      const { unmount } = renderHook(() => useChannelControls('track-1'), {
        wrapper: withDispatch(dispatch),
      });

      unmount();

      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe('cycleState', () => {
    it('dispatches a single SET_TRACK_MUTE_SOLO when cycling from on to solo', () => {
      const dispatch = vi.fn();
      const { result } = renderHook(() => useChannelControls('track-1'), {
        wrapper: withDispatch(dispatch),
      });

      result.current.cycleState();

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith([
        SET_TRACK_MUTE_SOLO,
        { trackId: 'track-1', mute: false, solo: true },
      ]);
    });

    // A single dispatch covering both fields — not two separate ones — so
    // one click is one undo-stack entry (the bug code review caught: two
    // dispatches meant two undos were needed to reverse one click).
    it('dispatches a single SET_TRACK_MUTE_SOLO when cycling from solo to mute', () => {
      trackService.getSignals('track-1')!.solo.value = true;
      const dispatch = vi.fn();
      const { result } = renderHook(() => useChannelControls('track-1'), {
        wrapper: withDispatch(dispatch),
      });

      result.current.cycleState();

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith([
        SET_TRACK_MUTE_SOLO,
        { trackId: 'track-1', mute: true, solo: false },
      ]);
    });

    it('dispatches a single SET_TRACK_MUTE_SOLO when cycling from mute to on', () => {
      trackService.getSignals('track-1')!.mute.value = true;
      const dispatch = vi.fn();
      const { result } = renderHook(() => useChannelControls('track-1'), {
        wrapper: withDispatch(dispatch),
      });

      result.current.cycleState();

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith([
        SET_TRACK_MUTE_SOLO,
        { trackId: 'track-1', mute: false, solo: false },
      ]);
    });
  });
});
