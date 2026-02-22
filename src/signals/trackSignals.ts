import { signal, type Signal } from '@preact/signals-react';
import { type TrackId } from '../components/project/projectPageReducer';

const DEFAULT_VOLUME = 100;

export type TrackSignals = {
  volume: Signal<number>;
  mute: Signal<boolean>;
  solo: Signal<boolean>;
};

const store = new Map<TrackId, TrackSignals>();

function create(trackId: TrackId): TrackSignals {
  const signals: TrackSignals = {
    volume: signal(DEFAULT_VOLUME),
    mute: signal(false),
    solo: signal(false),
  };
  store.set(trackId, signals);
  return signals;
}

function get(trackId: TrackId): TrackSignals | undefined {
  return store.get(trackId);
}

function dispose(trackId: TrackId): void {
  store.delete(trackId);
}

function reset(): void {
  store.clear();
}

function keys(): IterableIterator<TrackId> {
  return store.keys();
}

export const TrackSignalStore = { create, get, dispose, reset, keys };
