import { type TrackColor } from '../tracks/types';

class SpectrogramCanvasRenderer {
  private canvasContext: CanvasRenderingContext2D | null;
  private colorMap: number[][];
  private height: number;
  private heightFactor: number;

  constructor(
    canvas: HTMLCanvasElement,
    color: TrackColor,
    height: number,
    heightFactor: number,
  ) {
    this.canvasContext = SpectrogramCanvasRenderer.createCanvasContext(canvas);
    this.colorMap = SpectrogramCanvasRenderer.createColorMap(color);
    this.height = height;
    this.heightFactor = heightFactor;
  }

  private static createCanvasContext(
    canvas: HTMLCanvasElement,
  ): CanvasRenderingContext2D | null {
    const canvasContext = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
    });
    if (canvasContext) {
      canvasContext.imageSmoothingEnabled = false;
    }
    return canvasContext;
  }

  private static createColorMap(color: TrackColor): number[][] {
    const { r, g, b } = color;
    const colorMap = [];
    for (let i = 0; i < 256; i++) {
      const opacity = i / 256;
      colorMap.push([r, g, b, opacity]);
    }
    return colorMap;
  }

  drawSpectrogramFrame(frequencyData: Uint8Array, x: number) {
    if (!this.canvasContext) {
      return;
    }
    for (let i = 0, binCount = frequencyData.length; i < binCount; i++) {
      const color = this.colorMap[frequencyData[i]];
      this.canvasContext.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
      this.canvasContext.fillRect(
        x,
        this.height - i * this.heightFactor,
        1,
        this.heightFactor,
      );
    }
  }
}

export default SpectrogramCanvasRenderer;
