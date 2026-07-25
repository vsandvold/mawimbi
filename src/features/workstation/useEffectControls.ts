import { useEffect, useRef } from 'react';
import {
  EFFECT_ORDER,
  MIN_EFFECT_AMOUNT,
  type EffectAmounts,
  type EffectId,
} from '../tracks/EffectsChain';
import { resolveEchoSync, type EchoSubdivision } from '../tracks/echoSync';
import { type TrackTempo } from '../rhythm/tempo';
import { type TrackId } from '../tracks/types';
import { useTrackService } from '../tracks/useTrackService';
import {
  SET_TRACK_ECHO_SYNC,
  SET_TRACK_EFFECT,
} from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';
import {
  clearTrackPreview,
  requestTrackPreview,
} from '../spectrogram/previewOverlayRegistry';

// `tempo` and `echoSubdivision` come from the track record rather than being
// read here, for two reasons: the drawer's BPM badge and the subdivision
// control then resolve "does this track have a tempo" from the same
// `selectConfidentTempo` call on the same data (#560's coordination note),
// and the committed subdivision is plain project state — the signal this
// hook writes is the audio engine's copy, not a second source of truth for
// what the control should show.
export function useEffectControls(
  trackId: TrackId,
  tempo?: TrackTempo | undefined,
  echoSubdivision?: EchoSubdivision | undefined,
) {
  const trackHook = useTrackService();
  const dispatch = useProjectDispatch();
  const trackSignals = trackHook.getSignals(trackId);
  const dirtyRef = useRef<Record<EffectId, boolean>>({
    crush: false,
    space: false,
    echo: false,
    tone: false,
  });

  const amounts: EffectAmounts = {
    crush: trackSignals?.effects.crush.value ?? MIN_EFFECT_AMOUNT,
    space: trackSignals?.effects.space.value ?? MIN_EFFECT_AMOUNT,
    echo: trackSignals?.effects.echo.value ?? MIN_EFFECT_AMOUNT,
    tone: trackSignals?.effects.tone.value ?? MIN_EFFECT_AMOUNT,
  };

  const echoSync = resolveEchoSync(echoSubdivision, tempo);

  // Live update for immediate audio feedback while dragging — not
  // persisted, so a drag that's abandoned mid-gesture never dirties
  // project state.
  const updateAmount = (effectId: EffectId, amount: number) => {
    if (trackSignals) {
      trackSignals.effects[effectId].value = amount;
      dirtyRef.current[effectId] = true;
      requestTrackPreview(
        trackId,
        {
          ...amounts,
          [effectId]: amount,
        },
        echoSync,
      );
    }
  };

  // One dispatch per tap (issue requirement 3): the control is discrete, so
  // there is no live/commit split to make and no drag lifecycle to guard —
  // the whole Radix-slider commit-event class of bug (CLAUDE.md) is absent
  // here by construction. Tapping the active subdivision passes `null`,
  // which turns sync off and restores the fixed delay.
  //
  // The signal write is what the audio engine follows; the dispatch is what
  // persists and what undo reverses. Writing the signal here rather than
  // waiting for `useTrackControlsSync` to mirror the dispatch keeps the
  // echo's change on the same tick as the tap.
  const setEchoSubdivision = (subdivision: EchoSubdivision | null) => {
    if (trackSignals) {
      trackSignals.echoSync.value = resolveEchoSync(
        subdivision ?? undefined,
        tempo,
      );
    }
    dispatch([SET_TRACK_ECHO_SYNC, { trackId, subdivision }]);
  };

  // Persists once per gesture (slider release), like volume-style
  // transient controls — not per tick, so a drag doesn't spam undo history
  // or autosave. Clears the live preview overlay directly rather than
  // relying only on the committed entry's hash changing — a round-trip
  // drag (back to the amount it started from) commits the same hash, which
  // otherwise left the last provisional overlay stuck on screen (code
  // review finding, mawimbi#551).
  const commitAmount = (effectId: EffectId, amount: number) => {
    dirtyRef.current[effectId] = false;
    dispatch([SET_TRACK_EFFECT, { trackId, effectId, amount }]);
    clearTrackPreview(trackId);
  };

  // Drag end, independent of whether the released value differs from the
  // value at drag-start — Radix's own `onValueCommit` compares against
  // `valuesBeforeSlideStartRef` and simply never fires when they're equal
  // (`@radix-ui/react-slider`'s `handleSlideEnd`), so a round-trip drag
  // (up and back down to the original committed amount) never reaches
  // `commitAmount` at all, leaving the last provisional preview overlay
  // stuck on screen indefinitely (code review finding, mawimbi#551,
  // confirmed against a real drag in the browser — the hash-equality fix
  // in `commitAmount` above never even runs in this case). Same pointer-
  // lifecycle pattern as `useChannelControls.ts`'s `endFocus` — wired to a
  // wrapper's pointerup/pointercancel/lostpointercapture in
  // EffectsBottomSheet.tsx, not to any slider value event.
  const endDrag = () => clearTrackPreview(trackId);

  // Safety net for a drag that ends without ever reaching the slider's own
  // release handler — the drawer force-closes mid-drag when arming for
  // recording (#490), or the user cycles to another track mid-drag. Radix's
  // onValueCommit only fires from a pointerup on the still-mounted thumb
  // (CLAUDE.md, "Radix Slider's onValueCommit is not a release event");
  // without this, an audible, uncommitted change silently never reaches
  // project state and disappears on reload.
  useEffect(() => {
    const dirty = dirtyRef.current;
    return () => {
      const signals = trackHook.getSignals(trackId);
      if (!signals) return;
      let committedAny = false;
      for (const effectId of EFFECT_ORDER) {
        if (!dirty[effectId]) continue;
        dirty[effectId] = false;
        committedAny = true;
        dispatch([
          SET_TRACK_EFFECT,
          { trackId, effectId, amount: signals.effects[effectId].value },
        ]);
      }
      if (committedAny) clearTrackPreview(trackId);
    };
    // trackHook/dispatch delegate to stable service/context singletons
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  return { amounts, updateAmount, commitAmount, setEchoSubdivision, endDrag };
}
