import {
  MIN_EFFECT_AMOUNT,
  type EffectAmounts,
  type EffectId,
} from '../tracks/EffectsChain';
import { type TrackId } from '../tracks/types';
import { useTrackService } from '../tracks/useTrackService';

export function useEffectControls(trackId: TrackId) {
  const trackHook = useTrackService();
  const trackSignals = trackHook.getSignals(trackId);

  const amounts: EffectAmounts = {
    space: trackSignals?.effects.space.value ?? MIN_EFFECT_AMOUNT,
    echo: trackSignals?.effects.echo.value ?? MIN_EFFECT_AMOUNT,
    tone: trackSignals?.effects.tone.value ?? MIN_EFFECT_AMOUNT,
  };

  const updateAmount = (effectId: EffectId, amount: number) => {
    if (trackSignals) {
      trackSignals.effects[effectId].value = amount;
    }
  };

  return { amounts, updateAmount };
}
