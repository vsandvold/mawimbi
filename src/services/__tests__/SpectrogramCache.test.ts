import { vi } from 'vitest';
import { TrackColor } from '../../components/project/projectPageReducer';
import type { SpectrogramData } from '../OfflineAnalyser';
import SpectrogramCache from '../SpectrogramCache';

const COLOR: TrackColor = { r: 77, g: 238, b: 234 };

const MOCK_SPECTROGRAM_DATA: SpectrogramData = {
  frequencyFrames: [new Uint8Array([10, 20]), new Uint8Array([30, 40])],
  timeResolution: 0.025,
  frequencyBinCount: 2,
  sampleRate: 44100,
  duration: 0.05,
};

const mockAnalyseToFrames = vi.fn().mockResolvedValue(MOCK_SPECTROGRAM_DATA);

const mockOfflineAnalyserConstructor = vi.fn();

vi.mock('../OfflineAnalyser', () => {
  // Must be a regular function (not arrow) to support `new` in Vitest v4
  function MockOfflineAnalyser(...args: unknown[]) {
    mockOfflineAnalyserConstructor(...args);
    return { analyseToFrames: mockAnalyseToFrames };
  }
  return { default: MockOfflineAnalyser };
});

const mockTileBitmap = {
  close: vi.fn(),
  width: 2,
  height: 2,
} as unknown as ImageBitmap;
const mockRenderTiles = vi.fn().mockReturnValue([mockTileBitmap]);

vi.mock('../SpectrogramTileRenderer', () => ({
  renderTiles: (...args: unknown[]) => mockRenderTiles(...args),
}));

function mockAudioBuffer(): AudioBuffer {
  return {
    numberOfChannels: 1,
    length: 100,
    sampleRate: 44100,
    duration: 0.05,
    getChannelData: vi.fn(),
  } as unknown as AudioBuffer;
}

let cache: SpectrogramCache;

beforeEach(() => {
  cache = new SpectrogramCache();
  mockOfflineAnalyserConstructor.mockClear();
  mockAnalyseToFrames.mockClear();
  mockRenderTiles.mockClear();
  mockTileBitmap.close = vi.fn();
});

describe('analyse', () => {
  it('creates an OfflineAnalyser and calls analyseToFrames', async () => {
    const audioBuffer = mockAudioBuffer();

    await cache.analyse('track-1', audioBuffer, COLOR);

    expect(mockOfflineAnalyserConstructor).toHaveBeenCalledWith(audioBuffer);
    expect(mockAnalyseToFrames).toHaveBeenCalledOnce();
  });

  it('passes spectrogram data and color to renderTiles', async () => {
    await cache.analyse('track-1', mockAudioBuffer(), COLOR);

    expect(mockRenderTiles).toHaveBeenCalledWith(MOCK_SPECTROGRAM_DATA, COLOR);
  });

  it('stores the entry for later retrieval', async () => {
    await cache.analyse('track-1', mockAudioBuffer(), COLOR);

    const entry = cache.getEntry('track-1');
    expect(entry).toBeDefined();
    expect(entry!.data).toBe(MOCK_SPECTROGRAM_DATA);
    expect(entry!.tiles).toEqual([mockTileBitmap]);
  });

  it('overwrites an existing entry for the same track', async () => {
    await cache.analyse('track-1', mockAudioBuffer(), COLOR);

    const secondData: SpectrogramData = {
      ...MOCK_SPECTROGRAM_DATA,
      duration: 1.0,
    };
    mockAnalyseToFrames.mockResolvedValueOnce(secondData);
    const secondTile = { close: vi.fn() } as unknown as ImageBitmap;
    mockRenderTiles.mockReturnValueOnce([secondTile]);

    await cache.analyse('track-1', mockAudioBuffer(), COLOR);

    const entry = cache.getEntry('track-1');
    expect(entry!.data).toBe(secondData);
    expect(entry!.tiles).toEqual([secondTile]);
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

    await cache.analyse('track-1', mockAudioBuffer(), COLOR);

    mockAnalyseToFrames.mockResolvedValueOnce(secondData);
    mockRenderTiles.mockReturnValueOnce([secondTile]);

    await cache.analyse('track-2', mockAudioBuffer(), COLOR);

    expect(cache.getEntry('track-1')!.data).toBe(MOCK_SPECTROGRAM_DATA);
    expect(cache.getEntry('track-2')!.data).toBe(secondData);
  });
});

describe('invalidate', () => {
  it('removes the entry for the given track', async () => {
    await cache.analyse('track-1', mockAudioBuffer(), COLOR);

    cache.invalidate('track-1');

    expect(cache.getEntry('track-1')).toBeUndefined();
  });

  it('closes ImageBitmap tiles on invalidation', async () => {
    await cache.analyse('track-1', mockAudioBuffer(), COLOR);

    cache.invalidate('track-1');

    expect(mockTileBitmap.close).toHaveBeenCalledOnce();
  });

  it('does nothing when invalidating an unknown track', () => {
    expect(() => cache.invalidate('nonexistent')).not.toThrow();
  });

  it('does not affect other cached tracks', async () => {
    await cache.analyse('track-1', mockAudioBuffer(), COLOR);

    const secondTile = { close: vi.fn() } as unknown as ImageBitmap;
    mockRenderTiles.mockReturnValueOnce([secondTile]);
    await cache.analyse('track-2', mockAudioBuffer(), COLOR);

    cache.invalidate('track-1');

    expect(cache.getEntry('track-1')).toBeUndefined();
    expect(cache.getEntry('track-2')).toBeDefined();
  });
});

describe('invalidateAll', () => {
  it('removes all cached entries', async () => {
    await cache.analyse('track-1', mockAudioBuffer(), COLOR);

    const secondTile = { close: vi.fn() } as unknown as ImageBitmap;
    mockRenderTiles.mockReturnValueOnce([secondTile]);
    await cache.analyse('track-2', mockAudioBuffer(), COLOR);

    cache.invalidateAll();

    expect(cache.getEntry('track-1')).toBeUndefined();
    expect(cache.getEntry('track-2')).toBeUndefined();
  });

  it('closes all ImageBitmap tiles', async () => {
    const tile1 = { close: vi.fn() } as unknown as ImageBitmap;
    const tile2 = { close: vi.fn() } as unknown as ImageBitmap;
    mockRenderTiles.mockReturnValueOnce([tile1]);
    await cache.analyse('track-1', mockAudioBuffer(), COLOR);

    mockRenderTiles.mockReturnValueOnce([tile2]);
    await cache.analyse('track-2', mockAudioBuffer(), COLOR);

    cache.invalidateAll();

    expect(tile1.close).toHaveBeenCalledOnce();
    expect(tile2.close).toHaveBeenCalledOnce();
  });

  it('does nothing when cache is empty', () => {
    expect(() => cache.invalidateAll()).not.toThrow();
  });
});
