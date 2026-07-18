import { useSignals } from '@preact/signals-react/runtime';
import {
  activeRunwayConfig,
  RUNWAY_PRESETS,
  type RunwayPreset,
} from './runwayConfig';
import {
  closeTuningOverlay,
  selectTuningPreset,
  setTuningValue,
  signals as tuningSignals,
  toggleTuningOverlay,
} from './tuningSignals';

export function useTuningOverlay() {
  useSignals();

  return {
    // --- Reactive state (getters → lazy signal subscription via signals accessor) ---

    get isOpen(): boolean {
      return tuningSignals.isOverlayOpen.value;
    },
    get config(): RunwayPreset | null {
      return tuningSignals.configOverride.value;
    },

    // --- Constants ---

    presets: RUNWAY_PRESETS,

    // --- Actions ---

    toggle: () => toggleTuningOverlay(activeRunwayConfig),
    close: closeTuningOverlay,
    selectPreset: selectTuningPreset,
    setValue: setTuningValue,
  };
}
