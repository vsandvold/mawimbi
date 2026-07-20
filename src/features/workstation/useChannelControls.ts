import { useTrackService } from '../tracks/useTrackService';
import { type TrackId } from '../tracks/types';

const DEFAULT_VOLUME = 100;

export function useChannelControls(trackId: TrackId) {
  const trackHook = useTrackService();
  const trackSignals = trackHook.getSignals(trackId);
  const volume = trackSignals?.volume.value ?? DEFAULT_VOLUME;
  const mute = trackSignals?.mute.value ?? false;
  const solo = trackSignals?.solo.value ?? false;

  // Focus is driven purely by the pointer lifecycle (down → up/cancel),
  // never by slider value events: Radix's onValueCommit does not fire when
  // an interaction ends without a value change (press the thumb, release),
  // which left the timeline focus stuck after a plain fader tap.
  const startFocus = () => {
    trackHook.focusTrack(trackId);
  };

  const endFocus = () => {
    trackHook.unfocusTrack(trackId);
  };

  const updateVolume = (value: number) => {
    if (trackSignals) {
      trackSignals.volume.value = value;
    }
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
    endFocus,
    updateVolume,
    cycleState,
  };
}
