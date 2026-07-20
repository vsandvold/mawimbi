import { signal, type ReadonlySignal } from '@preact/signals-react';
import { type TrackId } from '../tracks/types';

export type CycleDirection = 'previous' | 'next';

const _activeEditTrackId = signal<TrackId | null>(null);

// Narrow channel for reactive consumers (hooks)
export const signals = {
  activeEditTrackId: _activeEditTrackId as ReadonlySignal<TrackId | null>,
};

// Plain getter for non-reactive consumers (tests, workflows)
export function getActiveEditTrackId(): TrackId | null {
  return _activeEditTrackId.value;
}

export function enterEditMode(trackId: TrackId): void {
  _activeEditTrackId.value = trackId;
}

export function exitEditMode(): void {
  _activeEditTrackId.value = null;
}

/**
 * Moves the active track within `trackIds` (chronological order — oldest
 * first, matching the track array, not the mixer's newest-on-top display
 * order). Clamps at both ends: no wrap-around (spec 004, Goal 2).
 */
export function cycleActiveTrack(
  trackIds: TrackId[],
  direction: CycleDirection,
): void {
  const currentId = _activeEditTrackId.value;
  if (currentId === null) return;

  const currentIndex = trackIds.indexOf(currentId);
  if (currentIndex === -1) return;

  const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex < 0 || nextIndex >= trackIds.length) return;

  _activeEditTrackId.value = trackIds[nextIndex];
}

export function resetEditModeSignals(): void {
  _activeEditTrackId.value = null;
}
