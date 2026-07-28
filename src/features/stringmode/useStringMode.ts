// SPIKE (mawimbi#593) — bridge hook for String mode's view state.
//
// The only place `stringSignals`' signals are read reactively; the render
// loop uses the plain getters instead (CLAUDE.md: never read `.value` on a
// signal obtained outside a bridge hook).

import { useSignals } from '@preact/signals-react/runtime';
import {
  resetStringParams,
  setStringParam,
  signals as stringSignals,
  toggleStringHud,
  toggleStringOverlay,
} from './stringSignals';
import { type StringParams } from './stringParams';

export function useStringMode() {
  useSignals();

  return {
    get params(): StringParams {
      return stringSignals.params.value;
    },
    get isOverlayOpen(): boolean {
      return stringSignals.isOverlayOpen.value;
    },
    get isHudVisible(): boolean {
      return stringSignals.isHudVisible.value;
    },

    setValue: setStringParam,
    reset: resetStringParams,
    toggleOverlay: toggleStringOverlay,
    toggleHud: toggleStringHud,
  };
}
