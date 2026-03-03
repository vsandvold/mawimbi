import { signal, type ReadonlySignal } from '@preact/signals-react';
import { type TrackId } from '../types/track';

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
