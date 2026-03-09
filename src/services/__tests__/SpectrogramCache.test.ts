import { vi } from 'vitest';
import { type TrackColor } from '../../types/track';
import { type MelodyData } from '../MelodyExtractor';
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
};

const mockTileBitmap = {
  close: vi.fn(),
  width: 2,
  height: 2,
} as unknown as ImageBitmap;

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

function simulateWorkerResult(
  data: SpectrogramData,
  tiles: ImageBitmap[],
  id = 0,
) {
  mockWorker.onmessage!({
    data: { id, type: 'result', data, tiles },
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
    expect(entry!.data).toBe(MOCK_SPECTROGRAM_DATA);
    expect(entry!.tiles).toEqual([mockTileBitmap]);
  });

  it('overwrites an existing entry for the same track', async () => {
    const promise1 = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap], 0);
    await promise1;

    const secondData: SpectrogramData = {
      ...MOCK_SPECTROGRAM_DATA,
      duration: 1.0,
    };
    const secondTile = { close: vi.fn() } as unknown as ImageBitmap;
    const promise2 = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(secondData, [secondTile], 1);
    await promise2;

    const entry = cache.getEntry('track-1');
    expect(entry!.data).toBe(secondData);
    expect(entry!.tiles).toEqual([secondTile]);
  });

  it('falls back to main thread when the worker responds with an error', async () => {
    const { default: MockOfflineAnalyser } = await import('../OfflineAnalyser');
    const { renderTiles: mockRenderTiles } =
      await import('../SpectrogramTileRenderer');

    const fallbackTile = { close: vi.fn() } as unknown as ImageBitmap;
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
    const secondTile = { close: vi.fn() } as unknown as ImageBitmap;

    const promise1 = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap], 0);
    await promise1;

    const promise2 = cache.analyse('track-2', mockAudioBuffer(), COLOR);
    simulateWorkerResult(secondData, [secondTile], 1);
    await promise2;

    expect(cache.getEntry('track-1')!.data).toBe(MOCK_SPECTROGRAM_DATA);
    expect(cache.getEntry('track-2')!.data).toBe(secondData);
  });
});

describe('restore', () => {
  it('populates the cache from pre-computed SpectrogramData', async () => {
    const { renderTiles: mockRenderTiles } = vi.mocked(
      await import('../SpectrogramTileRenderer'),
    );
    const restoredTile = { close: vi.fn() } as unknown as ImageBitmap;
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

    const secondTile = { close: vi.fn() } as unknown as ImageBitmap;
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

    const secondTile = { close: vi.fn() } as unknown as ImageBitmap;
    const promise2 = cache.analyse('track-2', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [secondTile], 1);
    await promise2;

    cache.invalidateAll();

    expect(cache.getEntry('track-1')).toBeUndefined();
    expect(cache.getEntry('track-2')).toBeUndefined();
  });

  it('closes all ImageBitmap tiles', async () => {
    const tile1 = { close: vi.fn() } as unknown as ImageBitmap;
    const tile2 = { close: vi.fn() } as unknown as ImageBitmap;

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

    const tile2 = { close: vi.fn() } as unknown as ImageBitmap;
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
