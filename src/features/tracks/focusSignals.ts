import { signal, type ReadonlySignal } from '@preact/signals-react';
import { type TrackId } from './types';

// Membership set, not a reference count: focusTrack is idempotent and
// unfocusTrack removes outright, so the writers (fader pointer lifecycle,
// reorder drag) assume at most one live gesture per track. Overlapping
// gestures on the same track (multi-touch) may drop the lift early; the
// state self-heals on the next release because unfocus is idempotent.
const _focusedTracks = signal<TrackId[]>([]);

// The reorder drag's live "over" target — which other track the dragged
// channel currently sits above, updated continuously as the drag crosses
// mixer rows. Distinct from focusedTracks (which stays pinned to the
// literally-dragged track for the whole gesture): this is what makes the
// preview feel live, since the dragged track alone would fully occlude
// everything behind it if it stayed opaque throughout.
const _dragTargetTrackId = signal<TrackId | null>(null);

// Narrow channel for reactive consumers (hooks)
export const signals = {
  focusedTracks: _focusedTracks as ReadonlySignal<TrackId[]>,
  dragTargetTrackId: _dragTargetTrackId as ReadonlySignal<TrackId | null>,
};

// Plain getter for non-reactive consumers (tests, workflows)
export function getFocusedTracks(): TrackId[] {
  return _focusedTracks.value;
}

export function focusTrack(trackId: TrackId): void {
  if (!_focusedTracks.value.includes(trackId)) {
    _focusedTracks.value = [..._focusedTracks.value, trackId];
  }
}

export function unfocusTrack(trackId: TrackId): void {
  _focusedTracks.value = _focusedTracks.value.filter((id) => id !== trackId);
}

export function getDragTargetTrackId(): TrackId | null {
  return _dragTargetTrackId.value;
}

export function setDragTargetTrackId(trackId: TrackId | null): void {
  // Explicit guard, not just relying on the signal's own equality check:
  // onDragOver fires on every collision recompute while hovering the same
  // row, and this makes the no-op self-evident rather than dependent on
  // library internals.
  if (trackId === _dragTargetTrackId.value) return;
  _dragTargetTrackId.value = trackId;
}

export function resetFocusSignals(): void {
  _focusedTracks.value = [];
  _dragTargetTrackId.value = null;
}
