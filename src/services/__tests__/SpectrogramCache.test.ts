import { vi } from 'vitest';
import { type TrackColor } from '../../types/track';
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

let cache: SpectrogramCache;

beforeEach(() => {
  cache = new SpectrogramCache();
  mockTileBitmap.close = vi.fn();
});

describe('analyse', () => {
  it('creates a Worker on first analyse call', async () => {
    const audioBuffer = mockAudioBuffer();
    const promise = cache.analyse('track-1', audioBuffer, COLOR);

    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    expect(Worker).toHaveBeenCalledWith(expect.any(URL), { type: 'module' });
  });

  it('reuses the same Worker across multiple analyse calls', async () => {
    const promise1 = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap], 0);
    await promise1;

    const promise2 = cache.analyse('track-2', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap], 1);
    await promise2;

    expect(Worker).toHaveBeenCalledTimes(1);
  });

  it('posts channel data, sampleRate, length, and color to the worker', async () => {
    const audioBuffer = mockAudioBuffer();
    const promise = cache.analyse('track-1', audioBuffer, COLOR);

    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    expect(mockWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 0,
        sampleRate: 44100,
        length: 3,
        color: COLOR,
      }),
      expect.any(Array),
    );

    const postedMessage = mockWorker.postMessage.mock.calls[0][0];
    expect(postedMessage.channelData).toHaveLength(1);
    expect(postedMessage.channelData[0]).toBeInstanceOf(Float32Array);
  });

  it('transfers channel data ArrayBuffers to avoid copying', async () => {
    const audioBuffer = mockAudioBuffer();
    const promise = cache.analyse('track-1', audioBuffer, COLOR);

    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    const transferables = mockWorker.postMessage.mock.calls[0][1];
    expect(transferables).toHaveLength(1);
    expect(transferables[0]).toBeInstanceOf(ArrayBuffer);
  });

  it('copies channel data before transfer to preserve the original AudioBuffer', async () => {
    const originalData = new Float32Array([0.1, 0.2, 0.3]);
    const audioBuffer = {
      numberOfChannels: 1,
      length: 3,
      sampleRate: 44100,
      duration: 3 / 44100,
      getChannelData: vi.fn().mockReturnValue(originalData),
    } as unknown as AudioBuffer;

    const promise = cache.analyse('track-1', audioBuffer, COLOR);

    const postedChannelData =
      mockWorker.postMessage.mock.calls[0][0].channelData[0];
    // Should be a different Float32Array (a copy, not the same reference)
    expect(postedChannelData).not.toBe(originalData);
    expect(Array.from(postedChannelData)).toEqual(Array.from(originalData));

    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;
  });

  it('extracts all channels for multi-channel audio', async () => {
    const audioBuffer = mockAudioBuffer(2);
    const promise = cache.analyse('track-1', audioBuffer, COLOR);

    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap]);
    await promise;

    const postedMessage = mockWorker.postMessage.mock.calls[0][0];
    expect(postedMessage.channelData).toHaveLength(2);
    expect(audioBuffer.getChannelData).toHaveBeenCalledWith(0);
    expect(audioBuffer.getChannelData).toHaveBeenCalledWith(1);
  });

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

  it('assigns sequential message IDs', async () => {
    const promise1 = cache.analyse('track-1', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap], 0);
    await promise1;

    const promise2 = cache.analyse('track-2', mockAudioBuffer(), COLOR);
    simulateWorkerResult(MOCK_SPECTROGRAM_DATA, [mockTileBitmap], 1);
    await promise2;

    expect(mockWorker.postMessage.mock.calls[0][0].id).toBe(0);
    expect(mockWorker.postMessage.mock.calls[1][0].id).toBe(1);
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
