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

  const cycleState = () => {
    if (!trackSignals) return;

    if (mute) {
      // mute → on
      trackSignals.mute.value = false;
    } else if (solo) {
      // solo → mute
      trackSignals.solo.value = false;
      trackSignals.mute.value = true;
    } else {
      // on → solo
      trackSignals.solo.value = true;
    }
  };

  return {
    volume,
    mute,
    solo,
    startFocus,
    updateVolume,
    commitVolume,
    cycleState,
  };
}
