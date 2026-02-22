import { computed, signal, type Signal } from '@preact/signals-react';
import { type TrackId } from '../components/project/projectPageReducer';

const DEFAULT_VOLUME = 100;

export type TrackSignals = {
  volume: Signal<number>;
  mute: Signal<boolean>;
  solo: Signal<boolean>;
};

const store = new Map<TrackId, TrackSignals>();

// Bumped on every store mutation so computed signals that depend on the
// store's membership (e.g. mutedTracks) know to re-evaluate.
const storeVersion = signal(0);

function create(trackId: TrackId): TrackSignals {
  const signals: TrackSignals = {
    volume: signal(DEFAULT_VOLUME),
    mute: signal(false),
    solo: signal(false),
  };
  store.set(trackId, signals);
  storeVersion.value++;
  return signals;
}

function get(trackId: TrackId): TrackSignals | undefined {
  return store.get(trackId);
}

function dispose(trackId: TrackId): void {
  store.delete(trackId);
  storeVersion.value++;
}

function reset(): void {
  store.clear();
  storeVersion.value++;
}

function keys(): IterableIterator<TrackId> {
  return store.keys();
}

export const TrackSignalStore = { create, get, dispose, reset, keys };

export const mutedTracks = computed(() => {
  // Subscribe to store membership changes
  void storeVersion.value;

  const allIds = Array.from(store.keys());
  const hasSolo = allIds.some((id) => store.get(id)!.solo.value);
  return allIds.filter((id) => {
    const s = store.get(id)!;
    return s.mute.value || (hasSolo && !s.solo.value);
  });
});
