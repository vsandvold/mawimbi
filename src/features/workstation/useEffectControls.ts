import { useEffect, useRef } from 'react';
import {
  EFFECT_ORDER,
  MIN_EFFECT_AMOUNT,
  type EffectAmounts,
  type EffectId,
} from '../tracks/EffectsChain';
import { type TrackId } from '../tracks/types';
import { useTrackService } from '../tracks/useTrackService';
import { SET_TRACK_EFFECT } from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';
import { requestTrackPreview } from '../spectrogram/previewOverlayRegistry';

export function useEffectControls(trackId: TrackId) {
  const trackHook = useTrackService();
  const dispatch = useProjectDispatch();
  const trackSignals = trackHook.getSignals(trackId);
  const dirtyRef = useRef<Record<EffectId, boolean>>({
    space: false,
    echo: false,
    tone: false,
  });

  const amounts: EffectAmounts = {
    space: trackSignals?.effects.space.value ?? MIN_EFFECT_AMOUNT,
    echo: trackSignals?.effects.echo.value ?? MIN_EFFECT_AMOUNT,
    tone: trackSignals?.effects.tone.value ?? MIN_EFFECT_AMOUNT,
  };

  // Live update for immediate audio feedback while dragging — not
  // persisted, so a drag that's abandoned mid-gesture never dirties
  // project state.
  const updateAmount = (effectId: EffectId, amount: number) => {
    if (trackSignals) {
      trackSignals.effects[effectId].value = amount;
      dirtyRef.current[effectId] = true;
      requestTrackPreview(trackId, {
        ...amounts,
        [effectId]: amount,
      });
    }
  };

  // Persists once per gesture (slider release), like volume-style
  // transient controls — not per tick, so a drag doesn't spam undo history
  // or autosave.
  const commitAmount = (effectId: EffectId, amount: number) => {
    dirtyRef.current[effectId] = false;
    dispatch([SET_TRACK_EFFECT, { trackId, effectId, amount }]);
  };

  // Safety net for a drag that ends without ever reaching the slider's own
  // release handler — the drawer force-closes mid-drag when arming for
  // recording (#490), or the user cycles to another track mid-drag. Radix's
  // onValueCommit only fires from a pointerup on the still-mounted thumb
  // (CLAUDE.md, "Radix Slider's onValueCommit is not a release event");
  // without this, an audible, uncommitted change silently never reaches
  // project state and disappears on reload.
  useEffect(() => {
    const dirty = dirtyRef.current;
    return () => {
      const signals = trackHook.getSignals(trackId);
      if (!signals) return;
      for (const effectId of EFFECT_ORDER) {
        if (!dirty[effectId]) continue;
        dirty[effectId] = false;
        dispatch([
          SET_TRACK_EFFECT,
          { trackId, effectId, amount: signals.effects[effectId].value },
        ]);
      }
    };
    // trackHook/dispatch delegate to stable service/context singletons
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  return { amounts, updateAmount, commitAmount };
}
