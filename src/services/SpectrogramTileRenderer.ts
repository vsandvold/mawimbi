import { type TrackColor } from '../types/track';
import { SpectrogramData } from './OfflineAnalyser';

const DEFAULT_TILE_WIDTH = 4096;
const COLOR_MAP_SIZE = 256;
const BYTES_PER_PIXEL = 4;

/**
 * Pre-computed RGBA lookup table for a track colour.
 * Index 0 = fully transparent (silence), index 255 = near-full opacity (loudest).
 * Each entry is [r, g, b, a] where a is 0–255.
 */
export function createColorMap(color: TrackColor): Uint8Array {
  const { r, g, b } = color;
  const map = new Uint8Array(COLOR_MAP_SIZE * BYTES_PER_PIXEL);
  for (let i = 0; i < COLOR_MAP_SIZE; i++) {
    const offset = i * BYTES_PER_PIXEL;
    const alpha = Math.round((i / COLOR_MAP_SIZE) * 255);
    map[offset] = r;
    map[offset + 1] = g;
    map[offset + 2] = b;
    map[offset + 3] = alpha;
  }
  return map;
}

/**
 * Renders a single tile's pixel data into an ImageData buffer.
 *
 * Frequency bins are drawn bottom-to-top: bin 0 is at the bottom row,
 * bin N-1 is at the top row — matching the convention in SpectrogramCanvasRenderer.
 */
function renderTilePixels(
  imageData: ImageData,
  frames: Uint8Array[],
  colorMap: Uint8Array,
  height: number,
): void {
  const pixels = imageData.data;
  const width = imageData.width;

  for (let col = 0; col < frames.length; col++) {
    const frame = frames[col];
    for (let bin = 0; bin < height; bin++) {
      // bin 0 → bottom row (height - 1), bin N-1 → top row (0)
      const row = height - 1 - bin;
      const pixelOffset = (row * width + col) * BYTES_PER_PIXEL;
      const colorOffset = frame[bin] * BYTES_PER_PIXEL;

      pixels[pixelOffset] = colorMap[colorOffset];
      pixels[pixelOffset + 1] = colorMap[colorOffset + 1];
      pixels[pixelOffset + 2] = colorMap[colorOffset + 2];
      pixels[pixelOffset + 3] = colorMap[colorOffset + 3];
    }
  }
}

/**
 * Converts SpectrogramData + track colour into an array of ImageBitmap tiles.
 *
 * Each tile is up to `tileWidth` pixels wide (the last tile may be narrower).
 * Height equals `frequencyBinCount`. Uses ImageData batch painting for performance.
 */
export function renderTiles(
  data: SpectrogramData,
  color: TrackColor,
  tileWidth: number = DEFAULT_TILE_WIDTH,
): ImageBitmap[] {
  const { frequencyFrames, frequencyBinCount } = data;
  const totalFrames = frequencyFrames.length;

  if (totalFrames === 0) {
    return [];
  }

  const colorMap = createColorMap(color);
  const tileCount = Math.ceil(totalFrames / tileWidth);
  const tiles: ImageBitmap[] = [];

  for (let t = 0; t < tileCount; t++) {
    const startFrame = t * tileWidth;
    const endFrame = Math.min(startFrame + tileWidth, totalFrames);
    const currentTileWidth = endFrame - startFrame;
    const tileFrames = frequencyFrames.slice(startFrame, endFrame);

    const canvas = new OffscreenCanvas(currentTileWidth, frequencyBinCount);
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(currentTileWidth, frequencyBinCount);

    renderTilePixels(imageData, tileFrames, colorMap, frequencyBinCount);
    ctx.putImageData(imageData, 0, 0);

    tiles.push(canvas.transferToImageBitmap());
  }

  return tiles;
}
