// Connects the effects drawer's live slider drag (`useEffectControls.ts`,
// workstation feature) to the active track's own `Spectrogram` mount
// (spec 006 M6, mawimbi#543) — the two live in different component trees,
// but only ever refer to the same track by id. `usePreviewOverlay.ts`
// registers a per-track trigger pair on mount/unmount, mirroring
// `TimelineRenderLoop`'s register/unregister pattern; `useEffectControls`
// looks the trigger up by trackId instead of needing a prop path between
// the two trees. `activeOverlays` doubles as the DEV bridge's read of
// "does this track currently have a live preview showing" (AudioService.ts).

import { type EffectAmounts } from '../tracks/EffectsChain';
import { type TrackId } from '../tracks/types';

type PreviewTrigger = {
  requestPreview: (amounts: EffectAmounts) => void;
  // Called directly from `commitAmount`/the unmount safety net
  // (`useEffectControls.ts`) the moment a drag ends — not just reactively
  // off the committed entry's hash changing. A commit that lands back at
  // the same amount it started from (a round-trip drag) never changes
  // that hash, so relying on it alone left the last provisional overlay
  // stuck on screen indefinitely (code review finding, mawimbi#551).
  clearPreview: () => void;
};

const triggers = new Map<TrackId, PreviewTrigger>();
const activeOverlays = new Set<TrackId>();

export function registerPreviewTrigger(
  trackId: TrackId,
  trigger: PreviewTrigger,
): () => void {
  triggers.set(trackId, trigger);
  return () => {
    if (triggers.get(trackId) === trigger) triggers.delete(trackId);
    activeOverlays.delete(trackId);
  };
}

export function requestTrackPreview(
  trackId: TrackId,
  amounts: EffectAmounts,
): void {
  triggers.get(trackId)?.requestPreview(amounts);
}

export function clearTrackPreview(trackId: TrackId): void {
  triggers.get(trackId)?.clearPreview();
}

export function markPreviewOverlayActive(
  trackId: TrackId,
  active: boolean,
): void {
  if (active) {
    activeOverlays.add(trackId);
  } else {
    activeOverlays.delete(trackId);
  }
}

export function hasActivePreviewOverlay(trackId: TrackId): boolean {
  return activeOverlays.has(trackId);
}
