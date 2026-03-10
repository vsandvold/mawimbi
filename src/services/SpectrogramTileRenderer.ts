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
 * Tiles are transposed for the vertical timeline: frequency bins map to
 * columns (X axis, bin 0 on the left = low frequency) and time frames
 * map to rows (Y axis, frame 0 at the top = earliest time).
 */
function renderTilePixels(
  imageData: ImageData,
  frames: Uint8Array[],
  colorMap: Uint8Array,
  frequencyBinCount: number,
): void {
  const pixels = imageData.data;
  const width = imageData.width;

  for (let row = 0; row < frames.length; row++) {
    const frame = frames[row];
    for (let bin = 0; bin < frequencyBinCount; bin++) {
      // bin 0 → left column (col 0), bin N-1 → right column (col N-1)
      const col = bin;
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
 * Tiles are transposed for vertical timeline rendering: width equals
 * `frequencyBinCount` (frequency axis, left-to-right) and height is up to
 * `tileFrames` frames (time axis, top-to-bottom). The last tile may be shorter.
 */
export function renderTiles(
  data: SpectrogramData,
  color: TrackColor,
  tileFrames: number = DEFAULT_TILE_WIDTH,
): ImageBitmap[] {
  const { frequencyFrames, frequencyBinCount } = data;
  const totalFrames = frequencyFrames.length;

  if (totalFrames === 0) {
    return [];
  }

  const colorMap = createColorMap(color);
  const tileCount = Math.ceil(totalFrames / tileFrames);
  const tiles: ImageBitmap[] = [];

  for (let t = 0; t < tileCount; t++) {
    const startFrame = t * tileFrames;
    const endFrame = Math.min(startFrame + tileFrames, totalFrames);
    const currentTileHeight = endFrame - startFrame;
    const frames = frequencyFrames.slice(startFrame, endFrame);

    const canvas = new OffscreenCanvas(frequencyBinCount, currentTileHeight);
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(frequencyBinCount, currentTileHeight);

    renderTilePixels(imageData, frames, colorMap, frequencyBinCount);
    ctx.putImageData(imageData, 0, 0);

    tiles.push(canvas.transferToImageBitmap());
  }

  return tiles;
}
