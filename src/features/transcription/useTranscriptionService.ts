// useTranscriptionService — React hook that bridges
// TranscriptionService signals to components.
//
// Provides reactive transcription state and lookup functions
// for speech-to-text results on each track.

import { useSignals } from '@preact/signals-react/runtime';
import { useContext } from 'react';
import { AudioServiceContext } from '../audio/useAudioService';
import type { TranscriptionState } from './TranscriptionService';
import type { TrackId } from '../tracks/types';

export function useTranscriptionService() {
  useSignals();
  const service = useContext(AudioServiceContext).transcriptionService;

  return {
    // --- Reactive state (getter → lazy signal subscription via signals accessor) ---

    get transcriptions() {
      return service.signals.transcriptions.value;
    },

    get downloadProgress() {
      return service.signals.downloadProgress.value;
    },

    // --- Lookups (read from signal so useSignals() tracks the subscription) ---

    getTranscription: (trackId: TrackId) =>
      service.signals.transcriptions.value.get(trackId)?.result,
    getTranscriptionState: (trackId: TrackId): TranscriptionState =>
      service.signals.transcriptions.value.get(trackId)?.state ?? 'idle',

    // --- Actions ---

    transcribe: (trackId: TrackId, audioBuffer: AudioBuffer) =>
      service.transcribe(trackId, audioBuffer),

    // --- Persistence ---

    loadCachedTranscription: (trackId: TrackId) =>
      service.loadCachedTranscription(trackId),
    deletePersistedTranscription: (trackId: TrackId) =>
      service.deletePersistedTranscription(trackId),

    // --- Cleanup ---

    removeTranscription: (trackId: TrackId) =>
      service.removeTranscription(trackId),
    reset: () => service.reset(),
  };
}
