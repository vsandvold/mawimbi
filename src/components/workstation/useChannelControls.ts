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

    if (solo) {
      // solo → on
      trackSignals.solo.value = false;
    } else if (mute) {
      // mute → solo
      trackSignals.mute.value = false;
      trackSignals.solo.value = true;
    } else {
      // on → mute
      trackSignals.mute.value = true;
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
