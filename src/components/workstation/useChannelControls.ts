import { useTrackService } from '../../hooks/useTrackService';
import { type TrackId } from '../../types/track';

const DEFAULT_VOLUME = 100;

export function useChannelControls(trackId: TrackId) {
  const trackHook = useTrackService();
  const trackSignals = trackHook.getSignals(trackId);
  const volume = trackSignals?.volume.value ?? DEFAULT_VOLUME;
  const mute = trackSignals?.mute.value ?? false;
  const solo = trackSignals?.solo.value ?? false;

  const startFocus = () => {
    trackHook.focusTrack(trackId);
  };

  const updateVolume = (value: number) => {
    if (trackSignals) {
      trackSignals.volume.value = value;
    }
    startFocus();
  };

  const commitVolume = () => {
    trackHook.unfocusTrack(trackId);
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
