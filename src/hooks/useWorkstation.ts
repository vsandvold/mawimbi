// useWorkstation — React hook that bridges workstation signals to components.
//
// Provides reactive zoom state and zoom actions. Components read
// pixelsPerSecond and zoom limits without touching signals directly.

import { useSignals } from '@preact/signals-react/runtime';
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  pixelsPerSecond as pixelsPerSecondSignal,
  zoomIn,
  zoomOut,
  setZoom,
} from '../signals/workstationSignals';

export function useWorkstation() {
  useSignals();

  return {
    // --- Reactive state ---

    get pixelsPerSecond(): number {
      return pixelsPerSecondSignal.value;
    },
    get isMaxZoom(): boolean {
      return pixelsPerSecondSignal.value >= MAX_PIXELS_PER_SECOND;
    },
    get isMinZoom(): boolean {
      return pixelsPerSecondSignal.value <= MIN_PIXELS_PER_SECOND;
    },

    // --- Actions ---

    zoomIn,
    zoomOut,
    setZoom,
  };
}
