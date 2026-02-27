import { createColorMap } from '../../../services/SpectrogramTileRenderer';
import { type TrackColor } from '../../../types/track';
import { dbToByte } from './spectrogramRenderer';

const INITIAL_WIDTH = 8192;
const BYTES_PER_PIXEL = 4;

/**
 * Accumulates live microphone frequency data during recording into an
 * OffscreenCanvas buffer. Each call to addFrame() appends a single-pixel
 * column. The buffer grows automatically when full.
 *
 * Frequency bins are drawn bottom-to-top (bin 0 at bottom) to match
 * the offline tile rendering convention.
 */
class RecordingBuffer {
  frameCount = 0;

  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private colorMap: Uint8Array;
  private height: number;

  constructor(color: TrackColor, frequencyBinCount: number) {
    this.height = frequencyBinCount;
    this.canvas = new OffscreenCanvas(INITIAL_WIDTH, frequencyBinCount);
    this.ctx = this.canvas.getContext('2d')!;
    this.colorMap = createColorMap(color);
  }

  addFrame(frequencyData: Float32Array): void {
    if (this.frameCount >= this.canvas.width) {
      this.grow();
    }

    const col = this.frameCount;
    const bins = Math.min(frequencyData.length, this.height);
    const imageData = this.ctx.createImageData(1, this.height);
    const pixels = imageData.data;

    for (let bin = 0; bin < bins; bin++) {
      const byte = dbToByte(frequencyData[bin]);
      // bin 0 → bottom row, last bin → top row
      const row = this.height - 1 - bin;
      const pixelOffset = row * BYTES_PER_PIXEL;
      const colorOffset = byte * BYTES_PER_PIXEL;

      pixels[pixelOffset] = this.colorMap[colorOffset];
      pixels[pixelOffset + 1] = this.colorMap[colorOffset + 1];
      pixels[pixelOffset + 2] = this.colorMap[colorOffset + 2];
      pixels[pixelOffset + 3] = this.colorMap[colorOffset + 3];
    }

    this.ctx.putImageData(imageData, col, 0);
    this.frameCount++;
  }

  /**
   * Draws a region of the recording buffer to a destination canvas,
   * scaling from the buffer's native frequency bin height to the
   * display height.
   */
  drawTo(
    ctx: CanvasRenderingContext2D,
    srcX: number,
    srcWidth: number,
    destX: number,
    destWidth: number,
    destHeight: number,
  ): void {
    if (this.frameCount === 0 || srcWidth <= 0) return;
    ctx.drawImage(
      this.canvas,
      srcX,
      0,
      srcWidth,
      this.height,
      destX,
      0,
      destWidth,
      destHeight,
    );
  }

  private grow(): void {
    const newWidth = this.canvas.width * 2;
    const newCanvas = new OffscreenCanvas(newWidth, this.height);
    const newCtx = newCanvas.getContext('2d')!;
    newCtx.drawImage(this.canvas, 0, 0);
    this.canvas = newCanvas;
    this.ctx = newCtx;
  }
}

export default RecordingBuffer;
