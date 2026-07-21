import { useEffect, useRef } from 'react';
import { useTrackService } from '../tracks/useTrackService';
import { DEFAULT_VOLUME, type TrackId } from '../tracks/types';
import {
  SET_TRACK_MUTE,
  SET_TRACK_SOLO,
  SET_TRACK_VOLUME,
} from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';

export function useChannelControls(trackId: TrackId) {
  const trackHook = useTrackService();
  const dispatch = useProjectDispatch();
  const trackSignals = trackHook.getSignals(trackId);
  const volume = trackSignals?.volume.value ?? DEFAULT_VOLUME;
  const mute = trackSignals?.mute.value ?? false;
  const solo = trackSignals?.solo.value ?? false;
  const volumeDirtyRef = useRef(false);

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

  // Live update for immediate audio feedback while dragging — not
  // persisted, so a drag that's abandoned mid-gesture never dirties
  // project state.
  const updateVolume = (value: number) => {
    if (trackSignals) {
      trackSignals.volume.value = value;
      volumeDirtyRef.current = true;
    }
  };

  // Persists once per gesture (fader release), like the effects sliders —
  // not per tick, so a drag doesn't spam undo history or autosave.
  const commitVolume = (value: number) => {
    volumeDirtyRef.current = false;
    dispatch([SET_TRACK_VOLUME, { trackId, volume: value }]);
  };

  // Safety net for a fader drag that ends without ever reaching the
  // slider's own release handler (see useEffectControls.ts's identical
  // pattern, #493) — without this, an audible, uncommitted volume change
  // silently never reaches project state and disappears on reload.
  useEffect(() => {
    return () => {
      if (!volumeDirtyRef.current) return;
      volumeDirtyRef.current = false;
      const signals = trackHook.getSignals(trackId);
      if (!signals) return;
      dispatch([SET_TRACK_VOLUME, { trackId, volume: signals.volume.value }]);
    };
    // trackHook/dispatch delegate to stable service/context singletons
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  // Each transition is a discrete click (not a drag), so it commits
  // immediately — no separate live/commit split like volume or effects.
  const cycleState = () => {
    if (!trackSignals) return;

    if (mute) {
      // mute → on
      trackSignals.mute.value = false;
      dispatch([SET_TRACK_MUTE, { trackId, mute: false }]);
    } else if (solo) {
      // solo → mute
      trackSignals.solo.value = false;
      trackSignals.mute.value = true;
      dispatch([SET_TRACK_SOLO, { trackId, solo: false }]);
      dispatch([SET_TRACK_MUTE, { trackId, mute: true }]);
    } else {
      // on → solo
      trackSignals.solo.value = true;
      dispatch([SET_TRACK_SOLO, { trackId, solo: true }]);
    }
  };

  return {
    volume,
    mute,
    solo,
    startFocus,
    endFocus,
    updateVolume,
    commitVolume,
    cycleState,
  };
}
