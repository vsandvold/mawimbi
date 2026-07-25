import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import React from 'react';
import AudioService from '../../audio/AudioService';
import { resetAllSignals } from '../../tracks/__tests__/testUtils';
import {
  SET_TRACK_ECHO_SYNC,
  SET_TRACK_EFFECT,
  type ProjectAction,
} from '../../project/projectPageReducer';
import { MIN_TEMPO_CONFIDENCE } from '../../rhythm/tempo';
import { type EchoSubdivision } from '../../tracks/echoSync';
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

// Tempo-synced Echo (spec 007 Goal 5, #560). Discrete taps, not a drag —
// there is no live/commit split and none of the Radix slider lifecycle
// above applies.
describe('useEffectControls echo sync', () => {
  const CONFIDENT_TEMPO = { bpm: 120, confidence: 3.77 };

  function renderWithDispatch(
    dispatch: React.Dispatch<ProjectAction>,
    tempo?: { bpm: number; confidence: number },
    subdivision?: EchoSubdivision,
  ) {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        ProjectDispatch.Provider,
        { value: dispatch },
        children,
      );
    return renderHook(() => useEffectControls('track-1', tempo, subdivision), {
      wrapper,
    });
  }

  it('dispatches exactly once per tap', () => {
    const dispatch = vi.fn();
    const { result } = renderWithDispatch(dispatch, CONFIDENT_TEMPO);

    result.current.setEchoSubdivision('dottedEighth');

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith([
      SET_TRACK_ECHO_SYNC,
      { trackId: 'track-1', subdivision: 'dottedEighth' },
    ]);
  });

  it('resolves the tap against the track tempo for the live chain', () => {
    const dispatch = vi.fn();
    const { result } = renderWithDispatch(dispatch, CONFIDENT_TEMPO);

    result.current.setEchoSubdivision('eighth');

    expect(trackService.getSignals('track-1')!.echoSync.value).toEqual({
      subdivision: 'eighth',
      bpm: 120,
    });
  });

  it('turns sync off, restoring the fixed delay', () => {
    const dispatch = vi.fn();
    const { result } = renderWithDispatch(dispatch, CONFIDENT_TEMPO, 'quarter');

    result.current.setEchoSubdivision(null);

    expect(trackService.getSignals('track-1')!.echoSync.value).toBeNull();
    expect(dispatch).toHaveBeenCalledWith([
      SET_TRACK_ECHO_SYNC,
      { trackId: 'track-1', subdivision: null },
    ]);
  });

  // The drawer hides the control without a confident tempo, but the state
  // has to agree: nothing reaches the audio engine that the badge above it
  // would deny exists (one gate, kb/decisions.md 2026-07-25).
  it('resolves to no sync when the tempo is not confident enough', () => {
    const dispatch = vi.fn();
    const { result } = renderWithDispatch(dispatch, {
      bpm: 120,
      confidence: MIN_TEMPO_CONFIDENCE - 0.01,
    });

    result.current.setEchoSubdivision('quarter');

    expect(trackService.getSignals('track-1')!.echoSync.value).toBeNull();
  });

  // The preview render has to hear what the live chain hears, or a drag
  // previews tiles from a delay time the track isn't playing.
  it('passes the current sync to the live preview during an echo drag', () => {
    const requestSpy = vi.spyOn(previewOverlayRegistry, 'requestTrackPreview');
    const dispatch = vi.fn();
    const { result } = renderWithDispatch(dispatch, CONFIDENT_TEMPO, 'quarter');

    result.current.updateAmount('echo', 70);

    expect(requestSpy).toHaveBeenLastCalledWith(
      'track-1',
      expect.objectContaining({ echo: 70 }),
      { subdivision: 'quarter', bpm: 120 },
    );
    requestSpy.mockRestore();
  });
});
