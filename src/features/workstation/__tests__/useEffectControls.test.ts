import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import React from 'react';
import AudioService from '../../audio/AudioService';
import { resetAllSignals } from '../../tracks/__tests__/testUtils';
import { SET_TRACK_EFFECT } from '../../project/projectPageReducer';
import { ProjectDispatch } from '../../project/useProjectDispatch';
import { useEffectControls } from '../useEffectControls';
import * as previewOverlayRegistry from '../../spectrogram/previewOverlayRegistry';

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

    // Regression for a code-review finding (mawimbi#551): clearing the
    // preview overlay used to happen only reactively, off the committed
    // entry's effectsParamsHash changing. A round-trip drag (back to the
    // amount it started from) commits the *same* hash, so that reactive
    // path never fires and the last provisional overlay stayed on screen
    // indefinitely. commitAmount must clear it directly, regardless of
    // whether the committed amount actually changed anything.
    it('clears the live preview overlay directly, even when committing back to the original amount', () => {
      const dispatch = vi.fn();
      const clearSpy = vi.spyOn(previewOverlayRegistry, 'clearTrackPreview');
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          ProjectDispatch.Provider,
          { value: dispatch },
          children,
        );

      const { result } = renderHook(() => useEffectControls('track-1'), {
        wrapper,
      });

      result.current.commitAmount('space', 0);

      expect(clearSpy).toHaveBeenCalledWith('track-1');
      clearSpy.mockRestore();
    });
  });

  describe('endDrag', () => {
    // Regression for a code-review finding (mawimbi#551), confirmed against
    // a real drag in the browser: Radix's own `onValueCommit` compares the
    // released value against the value at drag-*start*
    // (`valuesBeforeSlideStartRef` in `@radix-ui/react-slider`) and simply
    // never fires when they're equal — a round-trip drag (up and back down
    // to the original committed amount) never reaches `commitAmount` at
    // all, so the hash-equality fix there alone can't clear the overlay in
    // this case. `endDrag` is wired to the wrapper's pointer lifecycle in
    // EffectsBottomSheet.tsx (onPointerUp/onPointerCancel/
    // onLostPointerCapture), independent of any slider value event.
    it('clears the live preview overlay', () => {
      const clearSpy = vi.spyOn(previewOverlayRegistry, 'clearTrackPreview');
      const { result } = renderHook(() => useEffectControls('track-1'));

      result.current.endDrag();

      expect(clearSpy).toHaveBeenCalledWith('track-1');
      clearSpy.mockRestore();
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

    it('clears the live preview overlay when it commits a dirty amount on unmount', () => {
      const dispatch = vi.fn();
      const clearSpy = vi.spyOn(previewOverlayRegistry, 'clearTrackPreview');
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

      expect(clearSpy).toHaveBeenCalledWith('track-1');
      clearSpy.mockRestore();
    });

    it('does not clear the live preview overlay on unmount when nothing was dirty', () => {
      const dispatch = vi.fn();
      const clearSpy = vi.spyOn(previewOverlayRegistry, 'clearTrackPreview');
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

      expect(clearSpy).not.toHaveBeenCalled();
      clearSpy.mockRestore();
    });
  });
});
