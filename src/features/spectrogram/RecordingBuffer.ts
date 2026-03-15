import { createColorMap } from './SpectrogramTileRenderer';
import { type TrackColor } from '../tracks/types';

const INITIAL_HEIGHT = 8192;
const BYTES_PER_PIXEL = 4;

/**
 * Accumulates live visualization data during recording into an
 * OffscreenCanvas buffer. Each call to addFrame() appends a single-pixel
 * row. The buffer grows vertically when full.
 *
 * Transposed for vertical timeline: frequency bins map to columns
 * (X axis, bin 0 on the left = low frequency) and time frames map
 * to rows (Y axis, appended downward).
 */
class RecordingBuffer {
  frameCount = 0;

  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private colorMap: Uint8Array;
  private width: number;

  constructor(color: TrackColor, frequencyBinCount: number) {
    this.width = frequencyBinCount;
    this.canvas = new OffscreenCanvas(frequencyBinCount, INITIAL_HEIGHT);
    this.ctx = this.canvas.getContext('2d')!;
    this.colorMap = createColorMap(color);
  }

  addFrame(visualizationData: Uint8Array): void {
    if (this.frameCount >= this.canvas.height) {
      this.grow();
    }

    const row = this.frameCount;
    const bins = Math.min(visualizationData.length, this.width);
    const imageData = this.ctx.createImageData(this.width, 1);
    const pixels = imageData.data;

    for (let bin = 0; bin < bins; bin++) {
      const byte = visualizationData[bin];
      // bin 0 → left column (col 0), last bin → right column
      const col = bin;
      const pixelOffset = col * BYTES_PER_PIXEL;
      const colorOffset = byte * BYTES_PER_PIXEL;

      pixels[pixelOffset] = this.colorMap[colorOffset];
      pixels[pixelOffset + 1] = this.colorMap[colorOffset + 1];
      pixels[pixelOffset + 2] = this.colorMap[colorOffset + 2];
      pixels[pixelOffset + 3] = this.colorMap[colorOffset + 3];
    }

    this.ctx.putImageData(imageData, 0, row);
    this.frameCount++;
  }

  /**
   * Draws a region of the recording buffer to a destination canvas,
   * scaling from the buffer's native frequency bin width to the
   * display width.
   */
  drawTo(
    ctx: CanvasRenderingContext2D,
    srcY: number,
    srcHeight: number,
    destY: number,
    destHeight: number,
    destWidth: number,
  ): void {
    if (this.frameCount === 0 || srcHeight <= 0) return;
    ctx.drawImage(
      this.canvas,
      0,
      srcY,
      this.width,
      srcHeight,
      0,
      destY,
      destWidth,
      destHeight,
    );
  }

  private grow(): void {
    const newHeight = this.canvas.height * 2;
    const newCanvas = new OffscreenCanvas(this.width, newHeight);
    const newCtx = newCanvas.getContext('2d')!;
    newCtx.drawImage(this.canvas, 0, 0);
    this.canvas = newCanvas;
    this.ctx = newCtx;
  }
}

export default RecordingBuffer;
