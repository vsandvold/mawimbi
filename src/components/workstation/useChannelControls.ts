import { useSignals } from '@preact/signals-react/runtime';
import { focusTrack, unfocusTrack } from '../../signals/focusSignals';
import { TrackSignalStore } from '../../signals/trackSignals';
import { type TrackId } from '../../types/track';

const DEFAULT_VOLUME = 100;

export function useChannelControls(trackId: TrackId) {
  useSignals();
  const trackSignals = TrackSignalStore.get(trackId);
  const volume = trackSignals?.volume.value ?? DEFAULT_VOLUME;
  const mute = trackSignals?.mute.value ?? false;
  const solo = trackSignals?.solo.value ?? false;

  const startFocus = () => {
    focusTrack(trackId);
  };

  const updateVolume = (value: number) => {
    if (trackSignals) {
      trackSignals.volume.value = value;
    }
    startFocus();
  };

  const commitVolume = () => {
    unfocusTrack(trackId);
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
    startFocus,
    updateVolume,
    commitVolume,
    updateMute,
    updateSolo,
  };
}
