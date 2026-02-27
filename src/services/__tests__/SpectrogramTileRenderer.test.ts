import { vi } from 'vitest';
import { type TrackColor } from '../../types/track';
import { SpectrogramData } from '../OfflineAnalyser';
import { renderTiles } from '../SpectrogramTileRenderer';

const COLOR: TrackColor = { r: 77, g: 238, b: 234 };

// --- OffscreenCanvas / ImageBitmap / ImageData mocks for jsdom ---

const mockPutImageData = vi.fn();
const mockGetContext = vi.fn();
const mockTransferToImageBitmap = vi.fn();

class MockImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

class MockImageBitmap {
  readonly width: number;
  readonly height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

class MockOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return mockGetContext(this.width, this.height);
  }
  transferToImageBitmap() {
    return mockTransferToImageBitmap(this.width, this.height);
  }
}

beforeEach(() => {
  mockPutImageData.mockClear();
  mockGetContext.mockClear();
  mockTransferToImageBitmap.mockClear();

  mockGetContext.mockImplementation(() => ({
    createImageData: (iw: number, ih: number) => new MockImageData(iw, ih),
    putImageData: mockPutImageData,
  }));
  mockTransferToImageBitmap.mockImplementation(
    (w: number, h: number) => new MockImageBitmap(w, h),
  );

  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createSpectrogramData(
  frameCount: number,
  binCount: number,
  fillValue = 0,
): SpectrogramData {
  const frequencyFrames: Uint8Array[] = [];
  for (let i = 0; i < frameCount; i++) {
    const frame = new Uint8Array(binCount);
    frame.fill(fillValue);
    frequencyFrames.push(frame);
  }
  return {
    frequencyFrames,
    timeResolution: 0.025,
    frequencyBinCount: binCount,
    sampleRate: 44100,
    duration: frameCount * 0.025,
  };
}

describe('renderTiles', () => {
  it('returns empty array when there are no frequency frames', () => {
    const data = createSpectrogramData(0, 8);

    const tiles = renderTiles(data, COLOR);

    expect(tiles).toEqual([]);
  });

  it('returns a single tile when frames fit within tileWidth', () => {
    const data = createSpectrogramData(10, 8);

    const tiles = renderTiles(data, COLOR, 4096);

    expect(tiles).toHaveLength(1);
  });

  it('returns correct number of tiles when frames exceed tileWidth', () => {
    const tileWidth = 4;
    const data = createSpectrogramData(10, 8);

    const tiles = renderTiles(data, COLOR, tileWidth);

    // 10 frames / 4 per tile = ceil(2.5) = 3 tiles
    expect(tiles).toHaveLength(3);
  });

  it('creates tiles with correct dimensions', () => {
    const tileWidth = 4;
    const binCount = 8;
    const data = createSpectrogramData(10, binCount);

    const tiles = renderTiles(data, COLOR, tileWidth);

    // First two tiles: full width
    expect(tiles[0]).toHaveProperty('width', tileWidth);
    expect(tiles[0]).toHaveProperty('height', binCount);
    expect(tiles[1]).toHaveProperty('width', tileWidth);
    expect(tiles[1]).toHaveProperty('height', binCount);
    // Last tile: 10 - 2*4 = 2 frames wide
    expect(tiles[2]).toHaveProperty('width', 2);
    expect(tiles[2]).toHaveProperty('height', binCount);
  });

  it('creates OffscreenCanvas with correct dimensions for each tile', () => {
    const tileWidth = 4;
    const binCount = 8;
    const data = createSpectrogramData(6, binCount);

    renderTiles(data, COLOR, tileWidth);

    // 6 frames / 4 per tile = 2 tiles (4 wide, 2 wide)
    expect(mockGetContext).toHaveBeenCalledTimes(2);
    expect(mockGetContext).toHaveBeenNthCalledWith(1, tileWidth, binCount);
    expect(mockGetContext).toHaveBeenNthCalledWith(2, 2, binCount);
  });

  it('calls putImageData for each tile', () => {
    const tileWidth = 5;
    const data = createSpectrogramData(12, 8);

    renderTiles(data, COLOR, tileWidth);

    // ceil(12 / 5) = 3 tiles
    expect(mockPutImageData).toHaveBeenCalledTimes(3);
  });

  it('calls transferToImageBitmap for each tile', () => {
    const tileWidth = 5;
    const data = createSpectrogramData(12, 8);

    renderTiles(data, COLOR, tileWidth);

    expect(mockTransferToImageBitmap).toHaveBeenCalledTimes(3);
  });

  it('maps frequency value 0 to fully transparent pixels', () => {
    const binCount = 2;
    const data = createSpectrogramData(1, binCount, 0);

    // Capture the ImageData written via putImageData
    let capturedImageData: ImageData | undefined;
    mockPutImageData.mockImplementation((imageData: ImageData) => {
      capturedImageData = imageData;
    });

    renderTiles(data, COLOR, 4096);

    expect(capturedImageData).toBeDefined();
    const pixels = capturedImageData!.data;
    // Both bins should have alpha = 0 (transparent)
    for (let i = 0; i < binCount; i++) {
      const offset = i * 4; // single column, row i
      expect(pixels[offset + 3]).toBe(0); // alpha
    }
  });

  it('maps frequency value 255 to near-full opacity pixels', () => {
    const binCount = 2;
    const data = createSpectrogramData(1, binCount, 255);

    let capturedImageData: ImageData | undefined;
    mockPutImageData.mockImplementation((imageData: ImageData) => {
      capturedImageData = imageData;
    });

    renderTiles(data, COLOR, 4096);

    expect(capturedImageData).toBeDefined();
    const pixels = capturedImageData!.data;
    // Both bins should have high alpha
    const expectedAlpha = Math.round((255 / 256) * 255);
    for (let i = 0; i < binCount; i++) {
      const offset = i * 4;
      expect(pixels[offset + 3]).toBe(expectedAlpha);
    }
  });

  it('uses track color RGB values in pixel data', () => {
    const binCount = 1;
    const data = createSpectrogramData(1, binCount, 128);
    const customColor: TrackColor = { r: 255, g: 0, b: 128 };

    let capturedImageData: ImageData | undefined;
    mockPutImageData.mockImplementation((imageData: ImageData) => {
      capturedImageData = imageData;
    });

    renderTiles(data, customColor, 4096);

    expect(capturedImageData).toBeDefined();
    const pixels = capturedImageData!.data;
    expect(pixels[0]).toBe(255); // r
    expect(pixels[1]).toBe(0); // g
    expect(pixels[2]).toBe(128); // b
  });

  it('places low-frequency bins at the bottom of the tile', () => {
    const binCount = 4;
    // Single frame where each bin has a distinct value
    const frame = new Uint8Array([10, 20, 30, 40]);
    const data: SpectrogramData = {
      frequencyFrames: [frame],
      timeResolution: 0.025,
      frequencyBinCount: binCount,
      sampleRate: 44100,
      duration: 0.025,
    };

    let capturedImageData: ImageData | undefined;
    mockPutImageData.mockImplementation((imageData: ImageData) => {
      capturedImageData = imageData;
    });

    renderTiles(data, COLOR, 4096);

    expect(capturedImageData).toBeDefined();
    const pixels = capturedImageData!.data;
    const width = 1;

    // bin 0 (value 10) → bottom row (row 3)
    // bin 1 (value 20) → row 2
    // bin 2 (value 30) → row 1
    // bin 3 (value 40) → top row (row 0)
    const alphaForValue = (v: number) => Math.round((v / 256) * 255);

    const bottomRowAlpha = pixels[((binCount - 1) * width + 0) * 4 + 3];
    expect(bottomRowAlpha).toBe(alphaForValue(10));

    const topRowAlpha = pixels[(0 * width + 0) * 4 + 3];
    expect(topRowAlpha).toBe(alphaForValue(40));
  });

  it('uses default tile width of 4096 when not specified', () => {
    // Create data with more than 4096 frames to verify default tileWidth
    const data = createSpectrogramData(4097, 2);

    const tiles = renderTiles(data, COLOR);

    // ceil(4097 / 4096) = 2 tiles
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveProperty('width', 4096);
    expect(tiles[1]).toHaveProperty('width', 1);
  });

  it('handles exactly one tile worth of frames', () => {
    const tileWidth = 8;
    const data = createSpectrogramData(8, 4);

    const tiles = renderTiles(data, COLOR, tileWidth);

    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toHaveProperty('width', tileWidth);
  });
});
