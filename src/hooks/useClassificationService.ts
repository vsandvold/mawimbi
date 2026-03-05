// useClassificationService — React hook that bridges
// InstrumentClassificationService signals to components.
//
// Provides reactive classification state and lookup functions
// for instrument labels detected on each track.

import { useSignals } from '@preact/signals-react/runtime';
import { useContext } from 'react';
import { AudioServiceContext } from './useAudioService';
import type { ClassificationState } from '../services/InstrumentClassificationService';
import type { TrackId } from '../types/track';

export function useClassificationService() {
  useSignals();
  const service = useContext(AudioServiceContext).classificationService;

  return {
    // --- Reactive state (getter → lazy signal subscription via signals accessor) ---

    get classifications() {
      return service.signals.classifications.value;
    },

    get downloadProgress() {
      return service.signals.downloadProgress.value;
    },

    // --- Lookups (read from signal so useSignals() tracks the subscription) ---

    getClassification: (trackId: TrackId) =>
      service.signals.classifications.value.get(trackId)?.result,
    getClassificationState: (trackId: TrackId): ClassificationState =>
      service.signals.classifications.value.get(trackId)?.state ?? 'idle',

    // --- Cleanup ---

    removeClassification: (trackId: TrackId) =>
      service.removeClassification(trackId),
    reset: () => service.reset(),
  };
}
