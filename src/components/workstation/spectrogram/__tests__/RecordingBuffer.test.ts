import { vi } from 'vitest';
import RecordingBuffer from '../RecordingBuffer';

// OffscreenCanvas is not available in jsdom. Provide a minimal mock that
// tracks putImageData calls and supports the drawTo() path.
const mockPutImageData = vi.fn();
const mockDrawImage = vi.fn();
const mockClearRect = vi.fn();

const mockCtx = {
  putImageData: mockPutImageData,
  drawImage: mockDrawImage,
  clearRect: mockClearRect,
  createImageData: (w: number, h: number) => ({
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
  }),
};

vi.stubGlobal(
  'OffscreenCanvas',
  class {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return mockCtx;
    }
  },
);

const WHITE = { r: 255, g: 255, b: 255 };

beforeEach(() => {
  vi.clearAllMocks();
});

it('starts with zero frames', () => {
  const buffer = new RecordingBuffer(WHITE, 8);
  expect(buffer.frameCount).toBe(0);
});

it('increments frameCount on each addFrame call', () => {
  const buffer = new RecordingBuffer(WHITE, 8);
  const data = new Uint8Array(8).fill(128);

  buffer.addFrame(data);
  expect(buffer.frameCount).toBe(1);

  buffer.addFrame(data);
  expect(buffer.frameCount).toBe(2);
});

it('calls putImageData for each frame', () => {
  const buffer = new RecordingBuffer(WHITE, 8);
  const data = new Uint8Array(8).fill(128);

  buffer.addFrame(data);
  buffer.addFrame(data);

  // putImageData called once per frame, at column 0 and 1
  expect(mockPutImageData).toHaveBeenCalledTimes(2);
  expect(mockPutImageData.mock.calls[0][1]).toBe(0);
  expect(mockPutImageData.mock.calls[1][1]).toBe(1);
});

it('does not draw to destination when frameCount is 0', () => {
  const buffer = new RecordingBuffer(WHITE, 8);
  const destCtx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;

  buffer.drawTo(destCtx, 0, 10, 0, 100, 128);

  expect(destCtx.drawImage).not.toHaveBeenCalled();
});

it('does not draw to destination when srcWidth is 0', () => {
  const buffer = new RecordingBuffer(WHITE, 8);
  const data = new Uint8Array(8).fill(128);
  buffer.addFrame(data);

  const destCtx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;

  buffer.drawTo(destCtx, 0, 0, 0, 100, 128);

  expect(destCtx.drawImage).not.toHaveBeenCalled();
});

it('draws to destination canvas with correct parameters', () => {
  const buffer = new RecordingBuffer(WHITE, 8);
  const data = new Uint8Array(8).fill(128);
  buffer.addFrame(data);
  buffer.addFrame(data);

  const destDrawImage = vi.fn();
  const destCtx = {
    drawImage: destDrawImage,
  } as unknown as CanvasRenderingContext2D;

  buffer.drawTo(destCtx, 0, 2, 10, 200, 128);

  expect(destDrawImage).toHaveBeenCalledTimes(1);
  // drawImage(source, srcX, srcY, srcW, srcH, destX, destY, destW, destH)
  const args = destDrawImage.mock.calls[0];
  expect(args[1]).toBe(0); // srcX
  expect(args[2]).toBe(0); // srcY
  expect(args[3]).toBe(2); // srcWidth
  expect(args[4]).toBe(8); // srcHeight (frequency bin count)
  expect(args[5]).toBe(10); // destX
  expect(args[6]).toBe(0); // destY
  expect(args[7]).toBe(200); // destWidth
  expect(args[8]).toBe(128); // destHeight
});

it('creates ImageData with correct dimensions for each frame', () => {
  const bins = 16;
  const buffer = new RecordingBuffer(WHITE, bins);
  const data = new Uint8Array(bins).fill(128);

  buffer.addFrame(data);

  // createImageData is called with width=1, height=bins
  const imageData = mockPutImageData.mock.calls[0][0];
  expect(imageData.width).toBe(1);
  expect(imageData.height).toBe(bins);
});

it('maps silent data to transparent pixels', () => {
  const bins = 4;
  const buffer = new RecordingBuffer(WHITE, bins);
  // byte 0 → fully transparent
  const silentData = new Uint8Array(bins).fill(0);

  buffer.addFrame(silentData);

  const imageData = mockPutImageData.mock.calls[0][0];
  // All alpha values should be 0 (transparent)
  for (let i = 0; i < bins; i++) {
    const row = bins - 1 - i;
    const alpha = imageData.data[row * 4 + 3];
    expect(alpha).toBe(0);
  }
});

it('maps loud data to opaque pixels', () => {
  const bins = 4;
  const buffer = new RecordingBuffer(WHITE, bins);
  // byte 255 → near-full opacity
  const loudData = new Uint8Array(bins).fill(255);

  buffer.addFrame(loudData);

  const imageData = mockPutImageData.mock.calls[0][0];
  // All alpha values should be near max
  for (let i = 0; i < bins; i++) {
    const row = bins - 1 - i;
    const alpha = imageData.data[row * 4 + 3];
    expect(alpha).toBeGreaterThan(200);
  }
});

it('draws frequency bins bottom-to-top', () => {
  const bins = 4;
  const buffer = new RecordingBuffer(WHITE, bins);
  // Only the first bin is loud, rest are silent
  const data = new Uint8Array(bins).fill(0);
  data[0] = 255; // bin 0 = loud

  buffer.addFrame(data);

  const imageData = mockPutImageData.mock.calls[0][0];
  // bin 0 should be at the bottom row (row = bins - 1 - 0 = 3)
  const bottomAlpha = imageData.data[3 * 4 + 3]; // row 3
  const topAlpha = imageData.data[0 * 4 + 3]; // row 0

  expect(bottomAlpha).toBeGreaterThan(200);
  expect(topAlpha).toBe(0);
});
