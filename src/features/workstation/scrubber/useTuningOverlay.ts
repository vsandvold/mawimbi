import { useSignals } from '@preact/signals-react/runtime';
import { activeRunwayConfig, type RunwayPreset } from './runwayConfig';
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
    // --- Reactive state (getter → lazy signal subscription via signals accessor) ---

    // Non-null IS the overlay's open state (tuningSignals.ts) — there is no
    // separate open flag to read.
    get config(): RunwayPreset | null {
      return tuningSignals.configOverride.value;
    },
    // Prefer this over `config !== null` when only the open/closed state is
    // needed — it doesn't re-notify on every tuning slider drag (tuningSignals.ts).
    get isOpen(): boolean {
      return tuningSignals.isOpen.value;
    },

    // --- Actions ---

    toggle: () => toggleTuningOverlay(activeRunwayConfig),
    close: closeTuningOverlay,
    selectPreset: selectTuningPreset,
    setValue: setTuningValue,
  };
}
