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

export function resetFocusSignals(): void {
  focusedTracks.value = [];
}
