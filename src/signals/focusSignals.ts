import { signal } from '@preact/signals-react';
import { type TrackId } from '../components/project/projectPageReducer';

export const focusedTracks = signal<TrackId[]>([]);

export function focusTrack(trackId: TrackId): void {
  if (!focusedTracks.value.includes(trackId)) {
    focusedTracks.value = [...focusedTracks.value, trackId];
  }
}

export function unfocusTrack(trackId: TrackId): void {
  focusedTracks.value = focusedTracks.value.filter((id) => id !== trackId);
}

const UNFOCUS_DEBOUNCE_MS = 250;
const unfocusTimers = new Map<TrackId, number>();

export function debouncedUnfocusTrack(trackId: TrackId): void {
  const existing = unfocusTimers.get(trackId);
  if (existing) {
    clearTimeout(existing);
  }
  const timerId = window.setTimeout(() => {
    unfocusTrack(trackId);
    unfocusTimers.delete(trackId);
  }, UNFOCUS_DEBOUNCE_MS);
  unfocusTimers.set(trackId, timerId);
}

export function resetFocusSignals(): void {
  focusedTracks.value = [];
  unfocusTimers.forEach((timerId) => clearTimeout(timerId));
  unfocusTimers.clear();
}
