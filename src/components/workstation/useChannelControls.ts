import { useSignals } from '@preact/signals-react/runtime';
import {
  cancelDebouncedUnfocusTrack,
  debouncedUnfocusTrack,
  focusTrack,
} from '../../signals/focusSignals';
import { TrackSignalStore } from '../../signals/trackSignals';
import { type TrackId } from '../project/projectPageReducer';

const DEFAULT_VOLUME = 100;

export function useChannelControls(trackId: TrackId) {
  useSignals();
  const trackSignals = TrackSignalStore.get(trackId);
  const volume = trackSignals?.volume.value ?? DEFAULT_VOLUME;
  const mute = trackSignals?.mute.value ?? false;
  const solo = trackSignals?.solo.value ?? false;

  const updateVolume = (value: number) => {
    if (trackSignals) {
      trackSignals.volume.value = value;
    }
    focusTrack(trackId);
    cancelDebouncedUnfocusTrack(trackId);
  };

  const commitVolume = () => {
    debouncedUnfocusTrack(trackId);
  };

  const updateMute = () => {
    if (trackSignals) {
      trackSignals.mute.value = !mute;
    }
  };

  const updateSolo = () => {
    if (trackSignals) {
      trackSignals.solo.value = !solo;
    }
  };

  return {
    volume,
    mute,
    solo,
    updateVolume,
    commitVolume,
    updateMute,
    updateSolo,
  };
}
