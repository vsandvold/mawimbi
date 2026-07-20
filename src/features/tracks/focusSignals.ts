import { signal, type ReadonlySignal } from '@preact/signals-react';
import { type TrackId } from './types';

// Membership set, not a reference count: focusTrack is idempotent and
// unfocusTrack removes outright, so the writers (fader pointer lifecycle,
// reorder drag) assume at most one live gesture per track. Overlapping
// gestures on the same track (multi-touch) may drop the lift early; the
// state self-heals on the next release because unfocus is idempotent.
const _focusedTracks = signal<TrackId[]>([]);

// Narrow channel for reactive consumers (hooks)
export const signals = {
  focusedTracks: _focusedTracks as ReadonlySignal<TrackId[]>,
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

export function resetFocusSignals(): void {
  _focusedTracks.value = [];
}
