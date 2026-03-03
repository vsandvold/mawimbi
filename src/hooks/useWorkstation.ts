// useWorkstation — React hook that bridges workstation signals to components.
//
// Provides reactive zoom state and zoom actions. Components read
// pixelsPerSecond and zoom limits without touching signals directly.

import { useSignals } from '@preact/signals-react/runtime';
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  signals as workstationSignals,
  zoomIn,
  zoomOut,
  setZoom,
} from '../signals/workstationSignals';

export function useWorkstation() {
  useSignals();

  return {
    // --- Reactive state (getters → lazy signal subscription via signals accessor) ---

    get pixelsPerSecond(): number {
      return workstationSignals.pixelsPerSecond.value;
    },
    get isMaxZoom(): boolean {
      return workstationSignals.pixelsPerSecond.value >= MAX_PIXELS_PER_SECOND;
    },
    get isMinZoom(): boolean {
      return workstationSignals.pixelsPerSecond.value <= MIN_PIXELS_PER_SECOND;
    },

    // --- Actions ---

    zoomIn,
    zoomOut,
    setZoom,
  };
}
