import {
  MIN_EFFECT_AMOUNT,
  type EffectAmounts,
  type EffectId,
} from '../tracks/EffectsChain';
import { type TrackId } from '../tracks/types';
import { useTrackService } from '../tracks/useTrackService';
import { SET_TRACK_EFFECT } from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';

export function useEffectControls(trackId: TrackId) {
  const trackHook = useTrackService();
  const dispatch = useProjectDispatch();
  const trackSignals = trackHook.getSignals(trackId);

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
    }
  };

  // Persists once per gesture (slider release), like volume-style
  // transient controls — not per tick, so a drag doesn't spam undo history
  // or autosave.
  const commitAmount = (effectId: EffectId, amount: number) => {
    dispatch([SET_TRACK_EFFECT, { trackId, effectId, amount }]);
  };

  return { amounts, updateAmount, commitAmount };
}
