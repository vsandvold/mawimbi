import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type TrackColor } from '../../tracks/types';
import {
  loadSpectrogramData,
  resetDB,
  saveSpectrogramData,
} from '../../project/ProjectStorageService';
import { type SpectrogramData } from '../OfflineAnalyser';
import SpectrogramCache from '../SpectrogramCache';
import {
  fromSpectrogramStoreData,
  toSpectrogramStoreData,
} from '../useSpectrogramCache';

/**
 * Cache lifecycle: releasing raw frames post-persist and wiring eviction
 * (mawimbi#540, spec 006 milestone 3). Unlike `SpectrogramCache.test.ts`
 * (per-method unit coverage) and `projectPageEffects.test.ts` (hook-level
 * wiring — `invalidate`/`invalidateAll` firing on the right lifecycle
 * events), this file covers the cross-cutting property the milestone's
 * memory-safety argument depends on: eviction must not corrupt the
 * IndexedDB-backed restore path that undo relies on.
 */

vi.mock('../SpectrogramTileRenderer', () => ({
  renderTiles: vi.fn(() => [makeMockTile()]),
}));

const COLOR: TrackColor = { r: 77, g: 238, b: 234 };

const ORIGINAL_DATA: SpectrogramData = {
  frequencyFrames: [new Uint8Array([10, 20]), new Uint8Array([30, 40])],
  timeResolution: 0.025,
  frequencyBinCount: 2,
  sampleRate: 44100,
  duration: 0.05,
  totalFrames: 2,
};

function makeMockTile(): ImageBitmap {
  return { close: vi.fn(), width: 2, height: 2 } as unknown as ImageBitmap;
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
  });
  resetDB();
  vi.clearAllMocks();
});

describe('undo-delete after eviction', () => {
  it('restores rendering via the IndexedDB path once the evicted track reappears', async () => {
    const cache = new SpectrogramCache();

    // Seed a persisted session: a track was analysed earlier, its data
    // saved to IndexedDB, and its raw frames already released.
    cache.restore('track-1', ORIGINAL_DATA, COLOR);
    await saveSpectrogramData(toSpectrogramStoreData('track-1', ORIGINAL_DATA));
    cache.releaseFrames('track-1');

    const releasedEntry = cache.getEntry('track-1');
    expect(releasedEntry!.data.frequencyFrames).toEqual([]);

    // DELETE_TRACK-driven eviction (`useDeleteTrackAudio`'s new
    // `invalidate` call) — tiles close, the entry disappears.
    const releasedTile = releasedEntry!.tiles[0];
    cache.invalidate('track-1');

    expect(releasedTile.close).toHaveBeenCalledOnce();
    expect(cache.getEntry('track-1')).toBeUndefined();

    // Undo restores the track: `useSpectrogramCache` remounts, finds no
    // in-memory entry, and falls back to its IndexedDB check — exactly
    // the path this test exercises directly.
    const stored = await loadSpectrogramData('track-1');
    expect(stored).not.toBeNull();
    const restoredData = fromSpectrogramStoreData(stored!);
    cache.restore('track-1', restoredData, COLOR);

    const restoredEntry = cache.getEntry('track-1');
    expect(restoredEntry).toBeDefined();
    expect(restoredEntry!.tiles.length).toBeGreaterThan(0);
    expect(restoredEntry!.data.frequencyBinCount).toBe(
      ORIGINAL_DATA.frequencyBinCount,
    );
    expect(restoredEntry!.data.timeResolution).toBe(
      ORIGINAL_DATA.timeResolution,
    );
    expect(restoredEntry!.data.duration).toBe(ORIGINAL_DATA.duration);
  });

  it('invalidate on an entry whose frames were never released still restores cleanly', async () => {
    // Not every eviction follows a release (e.g. a track deleted mid-
    // analysis, before any persist) — invalidate must not assume it.
    const cache = new SpectrogramCache();
    cache.restore('track-1', ORIGINAL_DATA, COLOR);
    await saveSpectrogramData(toSpectrogramStoreData('track-1', ORIGINAL_DATA));

    cache.invalidate('track-1');
    expect(cache.getEntry('track-1')).toBeUndefined();

    const stored = await loadSpectrogramData('track-1');
    cache.restore('track-1', fromSpectrogramStoreData(stored!), COLOR);

    expect(cache.getEntry('track-1')).toBeDefined();
  });
});
