// useEditMode — React hook that bridges edit-mode signals to components.
//
// Same pattern as useWorkstation: reactive state via getters, actions
// passed through directly since they take no service context.

import { useSignals } from '@preact/signals-react/runtime';
import { type TrackId } from '../tracks/types';
import {
  cycleActiveTrack,
  enterEditMode,
  exitEditMode,
  signals as editModeSignals,
} from './editModeSignals';

export function useEditMode() {
  useSignals();

  return {
    // --- Reactive state (getters → lazy signal subscription via signals accessor) ---

    get activeEditTrackId(): TrackId | null {
      return editModeSignals.activeEditTrackId.value;
    },
    get isEditMode(): boolean {
      return editModeSignals.activeEditTrackId.value !== null;
    },

    // --- Actions ---

    enterEditMode,
    exitEditMode,
    cycleActiveTrack,
  };
}
