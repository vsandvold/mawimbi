// Connects the effects drawer's live slider drag (`useEffectControls.ts`,
// workstation feature) to the active track's own `Spectrogram` mount
// (spec 006 M6, mawimbi#543) — the two live in different component trees,
// but only ever refer to the same track by id. `usePreviewOverlay.ts`
// registers a per-track trigger on mount/unmount, mirroring
// `TimelineRenderLoop`'s register/unregister pattern; `useEffectControls`
// looks the trigger up by trackId instead of needing a prop path between
// the two trees. `activeOverlays` doubles as the DEV bridge's read of
// "does this track currently have a live preview showing" (AudioService.ts).

import { type EffectAmounts } from '../tracks/EffectsChain';
import { type TrackId } from '../tracks/types';

type PreviewRequester = (amounts: EffectAmounts) => void;

const requesters = new Map<TrackId, PreviewRequester>();
const activeOverlays = new Set<TrackId>();

export function registerPreviewRequester(
  trackId: TrackId,
  requester: PreviewRequester,
): () => void {
  requesters.set(trackId, requester);
  return () => {
    if (requesters.get(trackId) === requester) requesters.delete(trackId);
    activeOverlays.delete(trackId);
  };
}

export function requestTrackPreview(
  trackId: TrackId,
  amounts: EffectAmounts,
): void {
  requesters.get(trackId)?.(amounts);
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
