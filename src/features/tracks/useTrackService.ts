// useTrackService — React hook that bridges TrackService signals to components.
//
// Provides reactive track state (mutedTracks, focusedTracks) and callbacks
// for track creation, signal management, and audio retrieval.

import { useSignals } from '@preact/signals-react/runtime';
import { useContext } from 'react';
import { AudioServiceContext } from '../audio/useAudioService';
import {
  signals as focusSignals,
  focusTrack,
  unfocusTrack,
} from './focusSignals';
import { type EffectAmounts } from './EffectsChain';
import { type TrackId } from './types';

export function useTrackService() {
  useSignals();
  const service = useContext(AudioServiceContext).trackService;

  return {
    // --- Reactive state (getters → lazy signal subscription via signals accessor) ---

    get mutedTracks(): TrackId[] {
      return service.signals.mutedTracks.value;
    },
    get focusedTracks(): TrackId[] {
      return focusSignals.focusedTracks.value;
    },
    get dragTargetTrackId(): TrackId | null {
      return focusSignals.dragTargetTrackId.value;
    },

    // --- Focus actions ---

    focusTrack,
    unfocusTrack,
    setEditFocus: (trackId: TrackId | null) => service.setEditFocus(trackId),

    // --- Track creation ---

    createTrack: (arrayBuffer: ArrayBuffer) => service.createTrack(arrayBuffer),
    createRecordedTrack: (
      audioBuffer: AudioBuffer,
      arrayBuffer: ArrayBuffer,
      startTime: number,
    ) => service.createRecordedTrack(audioBuffer, arrayBuffer, startTime),
    restoreTrack: (
      trackId: string,
      arrayBuffer: ArrayBuffer,
      startTime: number,
      effects?: EffectAmounts,
    ) => service.restoreTrack(trackId, arrayBuffer, startTime, effects),

    // --- Signal management ---

    getSignals: (trackId: TrackId) => service.getSignals(trackId),
    createSignals: (
      trackId: TrackId,
      initialVolume?: number,
      effects?: EffectAmounts,
    ) => service.createSignals(trackId, initialVolume, effects),
    disposeSignals: (trackId: TrackId) => service.disposeSignals(trackId),

    // --- Track data retrieval ---

    retrieveAudioBuffer: (trackId: string) =>
      service.retrieveAudioBuffer(trackId),
    retrieveBlobUrl: (trackId: string) => service.retrieveBlobUrl(trackId),
    retrieveNormalizationGainDb: (trackId: string) =>
      service.retrieveNormalizationGainDb(trackId),
    retrieveInitialVolume: (trackId: string) =>
      service.retrieveInitialVolume(trackId),
    retrieveStartTime: (trackId: string) => service.retrieveStartTime(trackId),
    getTotalTime: () => service.getTotalTime(),

    // --- Audio engine ---

    getLoudness: () => service.getLoudness(),
    retrieveChannel: (trackId: string) => service.retrieveChannel(trackId),
    recreateChannel: (trackId: string) => service.recreateChannel(trackId),

    // --- Cleanup ---

    deleteChannel: (trackId: string) => service.deleteChannel(trackId),
    reset: () => service.reset(),
  };
}
