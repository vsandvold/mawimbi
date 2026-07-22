import { vi } from 'vitest';
import { type TrackColor } from '../../tracks/types';
import { type MelodyData } from '../../transcription/MelodyExtractor';
import type { SpectrogramData } from '../OfflineAnalyser';
import SpectrogramCache from '../SpectrogramCache';

vi.mock('../OfflineAnalyser', () => ({
  default: vi.fn(),
}));

vi.mock('../SpectrogramTileRenderer', () => ({
  renderTiles: vi.fn(),
}));

const COLOR: TrackColor = { r: 77, g: 238, b: 234 };

const MOCK_SPECTROGRAM_DATA: SpectrogramData = {
  frequencyFrames: [new Uint8Array([10, 20]), new Uint8Array([30, 40])],
  timeResolution: 0.025,
  frequencyBinCount: 2,
  sampleRate: 44100,
  duration: 0.05,
  totalFrames: 2,
};

const mockTileBitmap = {
  close: vi.fn(),
  width: 2,
  height: 2,
} as unknown as ImageBitmap;

// width/height matter now that setEntry's stats accounting (mawimbi#538)
// reads tile.width/tile.height — an ad-hoc `{ close: vi.fn() }` mock would
// silently compute NaN there.
function makeMockTile(): ImageBitmap {
  return { close: vi.fn(), width: 2, height: 2 } as unknown as ImageBitmap;
}

type MockWorker = {
  postMessage: ReturnType<typeof vi.fn>;
  onmessage: ((event: MessageEvent) => void) | null;
  terminate: ReturnType<typeof vi.fn>;
};

let mockWorker: MockWorker;

// Must be a regular function (not arrow) to support `new` in Vitest v4
vi.stubGlobal(
  'Worker',
  vi.fn().mockImplementation(function () {
    mockWorker = {
      postMessage: vi.fn(),
      onmessage: null,
      terminate: vi.fn(),
    };
    return mockWorker;
  }),
);

function mockAudioBuffer(channels = 1): AudioBuffer {
  const channelData = new Float32Array([0.1, 0.2, 0.3]);
  return {
    numberOfChannels: channels,
    length: 3,
    sampleRate: 44100,
    duration: 3 / 44100,
    getChannelData: vi.fn().mockReturnValue(channelData),
  } as unknown as AudioBuffer;
}

// Simulates the worker's real protocol (mawimbi#539, spec 006 milestone 2):
// tiles and frames arrive exclusively via 'chunk' messages, and the final
// 'result' message carries only scalar metadata (SpectrogramCache
// reconstructs `data` from what it already accumulated, rather than
// re-cloning every frame a second time — review fix, mawimbi#539). Every
// existing call site here passes a single-element `tiles` array, so one
// 'chunk' message covering the whole (small, synthetic)
// `data.frequencyFrames` reproduces the prior single-message behavior.
function simulateWorkerResult(
  data: SpectrogramData,
  tiles: ImageBitmap[],
  id = 0,
) {
  const [tile] = tiles;
  mockWorker.onmessage!({
    data: {
      id,
      type: 'chunk',
      frames: data.frequencyFrames,
      startFrame: 0,
      tile,
      frequencyBinCount: data.frequencyBinCount,
      timeResolution: data.timeResolution,
      sampleRate: data.sampleRate,
    },
  } as MessageEvent);
  mockWorker.onmessage!({
    data: {
      id,
      type: 'result',
      frequencyBinCount: data.frequencyBinCount,
      timeResolution: data.timeResolution,
      sampleRate: data.sampleRate,
      duration: data.duration,
    },
  } as MessageEvent);
}

function simulateWorkerError(message: string, id = 0) {
  mockWorker.onmessage!({
    data: { id, type: 'error', message },
  } as MessageEvent);
}

function simulateWorkerMelodyResult(data: MelodyData, id = 0) {
  mockWorker.onmessage!({
    data: { id, type: 'melody-result', data },
  } as MessageEvent);
}

const MOCK_MELODY_DATA: MelodyData = {
  notes: [
    { startTime: 0.1, endTime: 0.5, midiNote: 60, confidence: 0.9 },
    { startTime: 0.6, endTime: 1.0, midiNote: 64, confidence: 0.85 },
  ],
  timeResolution: 0.0029,
};

let cache: SpectrogramCache;

beforeEach(() => {
  cache = new SpectrogramCache();
  mockTileBitmap.close = vi.fn();
});

describe('analyse', () => {
  it('stores the entry from the worker response', async () => {
    const promise = cache.analyse('track-1', mockAudioBuffer(), COLOR);

    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    const entry = cache.getEntry('track-1');
    expect(entry).toBeDefined();
    expect(entry!.data).toEqual(MOCK_SPECTROGRAM_DATA);
    expect(entry!.tiles).toEqual([mockTileBitmap]);
  });

  it('overwrites an existing entry for the same track, closing the superseded tile', async () => {
    const promise1 = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap], 0);
    await promise1;

    const secondData: SpectrogramData = {
      ...MOCK_SPECTROGRAM_DATA,
      duration: 1.0,
    };
    const secondTile = makeMockTile();
    const promise2 = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(secondData, [secondTile], 1);
    await promise2;

    const entry = cache.getEntry('track-1');
    expect(entry!.data).toEqual(secondData);
    expect(entry!.tiles).toEqual([secondTile]);
    // The first entry's tile is entirely replaced (not reused by
    // reference) by the second analysis, so it must be closed rather than
    // silently leaked (review fix, mawimbi#539).
    expect(mockTileBitmap.close).toHaveBeenCalled();
  });

  it('applies each chunk via a fresh tiles array and notifies onProgress before the final result', async () => {
    const onProgress = vi.fn();
    const chunkTile1 = makeMockTile();
    const chunkTile2 = makeMockTile();

    const promise = cache.analyse(
      'track-1',
      mockAudioBuffer(),
      COLOR,
      undefined,
      onProgress,
    );

    mockWorker.onmessage!({
      data: {
        id: 0,
        type: 'chunk',
        frames: [MOCK_SPECTROGRAM_DATA.frequencyFrames[0]],
        startFrame: 0,
        tile: chunkTile1,
        frequencyBinCount: MOCK_SPECTROGRAM_DATA.frequencyBinCount,
        timeResolution: MOCK_SPECTROGRAM_DATA.timeResolution,
        sampleRate: MOCK_SPECTROGRAM_DATA.sampleRate,
      },
    } as MessageEvent);

    expect(onProgress).toHaveBeenCalledTimes(1);
    const afterFirstChunk = cache.getEntry('track-1');
    expect(afterFirstChunk?.tiles).toEqual([chunkTile1]);
    expect(afterFirstChunk?.data.frequencyFrames.length).toBe(1);
    expect(afterFirstChunk?.analysisComplete).toBe(false);

    mockWorker.onmessage!({
      data: {
        id: 0,
        type: 'chunk',
        frames: [MOCK_SPECTROGRAM_DATA.frequencyFrames[1]],
        startFrame: 1,
        tile: chunkTile2,
        frequencyBinCount: MOCK_SPECTROGRAM_DATA.frequencyBinCount,
        timeResolution: MOCK_SPECTROGRAM_DATA.timeResolution,
        sampleRate: MOCK_SPECTROGRAM_DATA.sampleRate,
      },
    } as MessageEvent);

    expect(onProgress).toHaveBeenCalledTimes(2);
    const afterSecondChunk = cache.getEntry('track-1');
    expect(afterSecondChunk?.tiles).toEqual([chunkTile1, chunkTile2]);
    // A fresh array each delivery, never a mutation of the previous one —
    // the #494 reference-identity dirty-check contract (CLAUDE.md).
    expect(afterSecondChunk?.tiles).not.toBe(afterFirstChunk?.tiles);
    expect(afterSecondChunk?.data.frequencyFrames.length).toBe(2);

    mockWorker.onmessage!({
      data: {
        id: 0,
        type: 'result',
        frequencyBinCount: MOCK_SPECTROGRAM_DATA.frequencyBinCount,
        timeResolution: MOCK_SPECTROGRAM_DATA.timeResolution,
        sampleRate: MOCK_SPECTROGRAM_DATA.sampleRate,
        duration: MOCK_SPECTROGRAM_DATA.duration,
      },
    } as MessageEvent);
    await promise;

    expect(onProgress).toHaveBeenCalledTimes(3);
    const finalEntry = cache.getEntry('track-1');
    expect(finalEntry?.data).toEqual(MOCK_SPECTROGRAM_DATA);
    expect(finalEntry?.tiles).toEqual([chunkTile1, chunkTile2]);
    expect(finalEntry?.analysisComplete).toBe(true);
  });

  it('falls back to main thread when the worker responds with an error', async () => {
    const { default: MockOfflineAnalyser } = await import('../OfflineAnalyser');
    const { renderTiles: mockRenderTiles } =
      await import('../SpectrogramTileRenderer');

    const fallbackTile = makeMockTile();
    const mockAnalyser = {
      analyseToFrames: vi.fn().mockResolvedValue(MOCK_SPECTROGRAM_DATA),
    };
    vi.mocked(MockOfflineAnalyser).mockImplementation(function () {
      return mockAnalyser;
    } as unknown as typeof MockOfflineAnalyser);
    vi.mocked(mockRenderTiles).mockReturnValue([fallbackTile]);

    const promise = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerError('OfflineAudioContext failed');
    await promise;

    expect(MockOfflineAnalyser).toHaveBeenCalled();
    const entry = cache.getEntry('track-1');
    expect(entry).toBeDefined();
    expect(entry!.tiles).toEqual([fallbackTile]);
  });
});

describe('getEntry', () => {
  it('returns undefined for an unknown track', () => {
    expect(cache.getEntry('nonexistent')).toBeUndefined();
  });

  it('returns the correct entry when multiple tracks are cached', async () => {
    const secondData: SpectrogramData = {
      ...MOCK_SPECTROGRAM_DATA,
      duration: 2.0,
    };
    const secondTile = makeMockTile();

    const promise1 = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap], 0);
    await promise1;

    const promise2 = cache.analyse('track-2', mockAudioBuffer(), COLOR);
    simulateWorkerResult(secondData, [secondTile], 1);
    await promise2;

    expect(cache.getEntry('track-1')!.data).toEqual(MOCK_SPECTROGRAM_DATA);
    expect(cache.getEntry('track-2')!.data).toEqual(secondData);
  });
});

describe('restore', () => {
  it('populates the cache from pre-computed SpectrogramData', async () => {
    const { renderTiles: mockRenderTiles } = vi.mocked(
      await import('../SpectrogramTileRenderer'),
    );
    const restoredTile = makeMockTile();
    mockRenderTiles.mockReturnValue([restoredTile]);

    cache.restore('track-1', MOCK_SPECTROGRAM_DATA, COLOR);

    const entry = cache.getEntry('track-1');
    expect(entry).toBeDefined();
    expect(entry!.data).toBe(MOCK_SPECTROGRAM_DATA);
    expect(entry!.tiles).toEqual([restoredTile]);
  });

  it('renders tiles from data without running analysis', async () => {
    const { renderTiles: mockRenderTiles } = vi.mocked(
      await import('../SpectrogramTileRenderer'),
    );
    mockRenderTiles.mockReturnValue([]);

    cache.restore('track-1', MOCK_SPECTROGRAM_DATA, COLOR);

    expect(mockRenderTiles).toHaveBeenCalledWith(MOCK_SPECTROGRAM_DATA, COLOR);
  });
});

describe('setEntry', () => {
  it('stamps analysisComplete on the entry, defaulting to true', () => {
    cache.setEntry('track-1', MOCK_SPECTROGRAM_DATA, []);
    expect(cache.getEntry('track-1')?.analysisComplete).toBe(true);

    cache.setEntry(
      'track-2',
      MOCK_SPECTROGRAM_DATA,
      [],
      undefined,
      undefined,
      false,
    );
    expect(cache.getEntry('track-2')?.analysisComplete).toBe(false);
  });

  it('closes a previous tile the new set does not reuse by reference, but leaves a reused tile open (review fix, mawimbi#539)', () => {
    const reusedTile = makeMockTile();
    const droppedTile = makeMockTile();
    const freshTile = makeMockTile();

    cache.setEntry(
      'track-1',
      MOCK_SPECTROGRAM_DATA,
      [reusedTile, droppedTile],
      undefined,
      undefined,
      false,
    );
    cache.setEntry('track-1', MOCK_SPECTROGRAM_DATA, [reusedTile, freshTile]);

    expect(reusedTile.close).not.toHaveBeenCalled();
    expect(droppedTile.close).toHaveBeenCalledOnce();
    expect(freshTile.close).not.toHaveBeenCalled();
  });

  it('does not attempt to close anything for a brand-new entry', () => {
    expect(() =>
      cache.setEntry('track-1', MOCK_SPECTROGRAM_DATA, [makeMockTile()]),
    ).not.toThrow();
  });
});

describe('subscribeToEntry', () => {
  it('notifies the subscriber on every setEntry call for that track', () => {
    const callback = vi.fn();
    cache.subscribeToEntry('track-1', callback);

    cache.setEntry(
      'track-1',
      MOCK_SPECTROGRAM_DATA,
      [],
      undefined,
      undefined,
      false,
    );
    cache.setEntry('track-1', MOCK_SPECTROGRAM_DATA, []);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith(
      expect.objectContaining({ analysisComplete: true }),
    );
  });

  it('does not notify a subscriber of a different track', () => {
    const callback = vi.fn();
    cache.subscribeToEntry('track-1', callback);

    cache.setEntry('track-2', MOCK_SPECTROGRAM_DATA, []);

    expect(callback).not.toHaveBeenCalled();
  });

  it('stops notifying once unsubscribed', () => {
    const callback = vi.fn();
    const unsubscribe = cache.subscribeToEntry('track-1', callback);
    unsubscribe();

    cache.setEntry('track-1', MOCK_SPECTROGRAM_DATA, []);

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('releaseFrames', () => {
  it('empties frequencyFrames while keeping tiles and metadata intact', async () => {
    const promise = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    cache.releaseFrames('track-1');

    const entry = cache.getEntry('track-1');
    expect(entry!.data.frequencyFrames).toEqual([]);
    expect(entry!.tiles).toEqual([mockTileBitmap]);
    expect(entry!.data.timeResolution).toBe(
      MOCK_SPECTROGRAM_DATA.timeResolution,
    );
    expect(entry!.data.frequencyBinCount).toBe(
      MOCK_SPECTROGRAM_DATA.frequencyBinCount,
    );
    expect(entry!.data.duration).toBe(MOCK_SPECTROGRAM_DATA.duration);
  });

  it('does not close tiles (they remain in use for rendering)', async () => {
    const promise = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    cache.releaseFrames('track-1');

    expect(mockTileBitmap.close).not.toHaveBeenCalled();
  });

  it('preserves melody data', async () => {
    const promise = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;
    cache.setMelody('track-1', MOCK_MELODY_DATA);

    cache.releaseFrames('track-1');

    expect(cache.getMelody('track-1')).toBe(MOCK_MELODY_DATA);
  });

  it('does nothing when releasing an unknown track', () => {
    expect(() => cache.releaseFrames('nonexistent')).not.toThrow();
  });
});

describe('invalidate', () => {
  it('removes the entry for the given track', async () => {
    const promise = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    cache.invalidate('track-1');

    expect(cache.getEntry('track-1')).toBeUndefined();
  });

  it('closes ImageBitmap tiles on invalidation', async () => {
    const promise = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    cache.invalidate('track-1');

    expect(mockTileBitmap.close).toHaveBeenCalledOnce();
  });

  it('does nothing when invalidating an unknown track', () => {
    expect(() => cache.invalidate('nonexistent')).not.toThrow();
  });

  it('does not affect other cached tracks', async () => {
    const promise1 = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap], 0);
    await promise1;

    const secondTile = makeMockTile();
    const promise2 = cache.analyse('track-2', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [secondTile], 1);
    await promise2;

    cache.invalidate('track-1');

    expect(cache.getEntry('track-1')).toBeUndefined();
    expect(cache.getEntry('track-2')).toBeDefined();
  });
});

describe('invalidateAll', () => {
  it('removes all cached entries', async () => {
    const promise1 = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap], 0);
    await promise1;

    const secondTile = makeMockTile();
    const promise2 = cache.analyse('track-2', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [secondTile], 1);
    await promise2;

    cache.invalidateAll();

    expect(cache.getEntry('track-1')).toBeUndefined();
    expect(cache.getEntry('track-2')).toBeUndefined();
  });

  it('closes all ImageBitmap tiles', async () => {
    const tile1 = makeMockTile();
    const tile2 = makeMockTile();

    const promise1 = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [tile1], 0);
    await promise1;

    const promise2 = cache.analyse('track-2', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [tile2], 1);
    await promise2;

    cache.invalidateAll();

    expect(tile1.close).toHaveBeenCalledOnce();
    expect(tile2.close).toHaveBeenCalledOnce();
  });

  it('does nothing when cache is empty', () => {
    expect(() => cache.invalidateAll()).not.toThrow();
  });
});

describe('getMelody', () => {
  it('returns undefined when no melody is set', async () => {
    const promise = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    expect(cache.getMelody('track-1')).toBeUndefined();
  });

  it('returns undefined for an unknown track', () => {
    expect(cache.getMelody('nonexistent')).toBeUndefined();
  });
});

describe('setMelody', () => {
  it('stores melody data on an existing entry', async () => {
    const promise = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    cache.setMelody('track-1', MOCK_MELODY_DATA);

    expect(cache.getMelody('track-1')).toBe(MOCK_MELODY_DATA);
  });

  it('does nothing when track does not exist', () => {
    expect(() =>
      cache.setMelody('nonexistent', MOCK_MELODY_DATA),
    ).not.toThrow();
    expect(cache.getMelody('nonexistent')).toBeUndefined();
  });

  it('makes melody available through getEntry', async () => {
    const promise = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    cache.setMelody('track-1', MOCK_MELODY_DATA);

    const entry = cache.getEntry('track-1');
    expect(entry?.melody).toBe(MOCK_MELODY_DATA);
  });

  it('invalidate removes melody data along with the entry', async () => {
    const promise = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    cache.setMelody('track-1', MOCK_MELODY_DATA);
    cache.invalidate('track-1');

    expect(cache.getMelody('track-1')).toBeUndefined();
  });

  it('invalidateAll removes melody data for all tracks', async () => {
    const promise1 = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap], 0);
    await promise1;

    const tile2 = makeMockTile();
    const promise2 = cache.analyse('track-2', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [tile2], 1);
    await promise2;

    cache.setMelody('track-1', MOCK_MELODY_DATA);
    cache.setMelody('track-2', MOCK_MELODY_DATA);
    cache.invalidateAll();

    expect(cache.getMelody('track-1')).toBeUndefined();
    expect(cache.getMelody('track-2')).toBeUndefined();
  });
});

describe('extractMelodyInWorker', () => {
  it('resolves with MelodyData from worker response', async () => {
    const promise = cache.extractMelodyInWorker(mockAudioBuffer());
    simulateWorkerMelodyResult(MOCK_MELODY_DATA);

    const result = await promise;
    expect(result).toBe(MOCK_MELODY_DATA);
  });

  it('rejects when worker responds with error', async () => {
    const promise = cache.extractMelodyInWorker(mockAudioBuffer());
    simulateWorkerError('essentia.js failed');

    await expect(promise).rejects.toThrow('essentia.js failed');
  });
});
