import { useEffect } from 'react';
import { useTrackService } from '../tracks/useTrackService';
import { type TrackId } from '../tracks/types';

const DEFAULT_VOLUME = 100;

export function useChannelControls(trackId: TrackId) {
  const trackHook = useTrackService();
  const trackSignals = trackHook.getSignals(trackId);
  const volume = trackSignals?.volume.value ?? DEFAULT_VOLUME;
  const mute = trackSignals?.mute.value ?? false;
  const solo = trackSignals?.solo.value ?? false;

  // Focus is driven purely by the pointer lifecycle (down → up/cancel/
  // lost capture), never by slider value events: Radix's onValueCommit
  // does not fire when an interaction ends without a value change (press
  // the thumb, release), which left the timeline focus stuck after a
  // plain fader tap. Deliberate tradeoff: keyboard volume changes (arrow
  // keys on the focused thumb) get no timeline lift — they have no
  // release event that could reliably clear it, and the pre-fix behavior
  // (focus from updateVolume) left keyboard focus stuck for the same
  // reason. Don't re-add startFocus to updateVolume.
  const startFocus = () => {
    trackHook.focusTrack(trackId);
  };

  const endFocus = () => {
    trackHook.unfocusTrack(trackId);
  };

  // The channel can unmount while the pointer is still down (sheet closed
  // via a keyboard-activated toggle, track removed) — no pointerup would
  // ever reach the wrapper then, so the hook itself must release the
  // focus. unfocusTrack is idempotent, so this is a no-op when the
  // interaction ended normally.
  useEffect(() => {
    return () => trackHook.unfocusTrack(trackId);
    // trackHook delegates to stable module functions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

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
