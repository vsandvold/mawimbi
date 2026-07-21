import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import React from 'react';
import AudioService from '../../audio/AudioService';
import { resetAllSignals } from '../../tracks/__tests__/testUtils';
import { SET_TRACK_EFFECT } from '../../project/projectPageReducer';
import { ProjectDispatch } from '../../project/useProjectDispatch';
import { useEffectControls } from '../useEffectControls';

const trackService = AudioService.getInstance().trackService;

beforeEach(() => {
  trackService.createSignals('track-1');
});

afterEach(() => {
  resetAllSignals();
});

describe('useEffectControls', () => {
  describe('updateAmount', () => {
    it('writes the effect signal without dispatching', () => {
      const dispatch = vi.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          ProjectDispatch.Provider,
          { value: dispatch },
          children,
        );

      const { result } = renderHook(() => useEffectControls('track-1'), {
        wrapper,
      });

      result.current.updateAmount('space', 40);

      expect(trackService.getSignals('track-1')!.effects.space.value).toBe(40);
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe('commitAmount', () => {
    it('dispatches SET_TRACK_EFFECT with the committed amount', () => {
      const dispatch = vi.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          ProjectDispatch.Provider,
          { value: dispatch },
          children,
        );

      const { result } = renderHook(() => useEffectControls('track-1'), {
        wrapper,
      });

      result.current.commitAmount('echo', 65);

      expect(dispatch).toHaveBeenCalledWith([
        SET_TRACK_EFFECT,
        { trackId: 'track-1', effectId: 'echo', amount: 65 },
      ]);
    });
  });

  describe('uncommitted-drag safety net', () => {
    // A drag that never reaches the slider's own release handler (drawer
    // force-closed mid-drag, e.g. arming for recording per #490) must not
    // silently lose the live change — see CLAUDE.md's Radix onValueCommit
    // gotcha.
    it('commits a live but uncommitted amount on unmount', () => {
      const dispatch = vi.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          ProjectDispatch.Provider,
          { value: dispatch },
          children,
        );

      const { result, unmount } = renderHook(
        () => useEffectControls('track-1'),
        { wrapper },
      );

      result.current.updateAmount('tone', 33);
      unmount();

      expect(dispatch).toHaveBeenCalledWith([
        SET_TRACK_EFFECT,
        { trackId: 'track-1', effectId: 'tone', amount: 33 },
      ]);
    });

    it('does not re-dispatch on unmount once the amount was already committed', () => {
      const dispatch = vi.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          ProjectDispatch.Provider,
          { value: dispatch },
          children,
        );

      const { result, unmount } = renderHook(
        () => useEffectControls('track-1'),
        { wrapper },
      );

      result.current.updateAmount('tone', 33);
      result.current.commitAmount('tone', 33);
      dispatch.mockClear();
      unmount();

      expect(dispatch).not.toHaveBeenCalled();
    });

    it('does not dispatch on unmount when no amount was ever touched', () => {
      const dispatch = vi.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          ProjectDispatch.Provider,
          { value: dispatch },
          children,
        );

      const { unmount } = renderHook(() => useEffectControls('track-1'), {
        wrapper,
      });

      unmount();

      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
