import { type TrackColor } from '../../types/track';
import SpectrogramCanvasRenderer from '../SpectrogramCanvasRenderer';

const COLOR: TrackColor = { r: 77, g: 238, b: 234 };
const HEIGHT = 8;
const HEIGHT_FACTOR = 1;

function createMockCanvas(context: CanvasRenderingContext2D | null) {
  return {
    getContext: vi.fn().mockReturnValue(context),
  } as unknown as HTMLCanvasElement;
}

function createMockContext() {
  return {
    imageSmoothingEnabled: true,
    fillStyle: '',
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('SpectrogramCanvasRenderer', () => {
  it('requests a 2d context with alpha and desynchronized', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context);

    new SpectrogramCanvasRenderer(canvas, COLOR, HEIGHT, HEIGHT_FACTOR);

    expect(canvas.getContext).toHaveBeenCalledWith('2d', {
      alpha: true,
      desynchronized: true,
    });
  });

  it('disables image smoothing on the context', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context);

    new SpectrogramCanvasRenderer(canvas, COLOR, HEIGHT, HEIGHT_FACTOR);

    expect(context.imageSmoothingEnabled).toBe(false);
  });

  it('draws one fillRect per frequency bin', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context);
    const renderer = new SpectrogramCanvasRenderer(
      canvas,
      COLOR,
      HEIGHT,
      HEIGHT_FACTOR,
    );
    const frequencyData = new Uint8Array([0, 128, 255]);

    renderer.drawSpectrogramFrame(frequencyData, 5);

    expect(context.fillRect).toHaveBeenCalledTimes(3);
  });

  it('draws bins from bottom to top at the given x position', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context);
    const renderer = new SpectrogramCanvasRenderer(
      canvas,
      COLOR,
      HEIGHT,
      HEIGHT_FACTOR,
    );
    const frequencyData = new Uint8Array([100, 200]);

    renderer.drawSpectrogramFrame(frequencyData, 10);

    // bin 0: y = height - 0 * heightFactor = 8
    expect(context.fillRect).toHaveBeenNthCalledWith(1, 10, 8, 1, 1);
    // bin 1: y = height - 1 * heightFactor = 7
    expect(context.fillRect).toHaveBeenNthCalledWith(2, 10, 7, 1, 1);
  });

  it('uses heightFactor for rect height and y stride', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context);
    const heightFactor = 3;
    const renderer = new SpectrogramCanvasRenderer(
      canvas,
      COLOR,
      24,
      heightFactor,
    );
    const frequencyData = new Uint8Array([128, 128]);

    renderer.drawSpectrogramFrame(frequencyData, 0);

    // bin 0: y = 24 - 0 * 3 = 24, height = 3
    expect(context.fillRect).toHaveBeenNthCalledWith(1, 0, 24, 1, 3);
    // bin 1: y = 24 - 1 * 3 = 21, height = 3
    expect(context.fillRect).toHaveBeenNthCalledWith(2, 0, 21, 1, 3);
  });

  it('maps frequency value 0 to fully transparent', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context);
    const renderer = new SpectrogramCanvasRenderer(
      canvas,
      COLOR,
      HEIGHT,
      HEIGHT_FACTOR,
    );

    renderer.drawSpectrogramFrame(new Uint8Array([0]), 0);

    expect(context.fillStyle).toBe('rgba(77, 238, 234, 0)');
  });

  it('maps frequency value 255 to near-full opacity', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context);
    const renderer = new SpectrogramCanvasRenderer(
      canvas,
      COLOR,
      HEIGHT,
      HEIGHT_FACTOR,
    );

    renderer.drawSpectrogramFrame(new Uint8Array([255]), 0);

    // 255 / 256 = 0.99609375
    expect(context.fillStyle).toBe(`rgba(77, 238, 234, ${255 / 256})`);
  });

  it('uses the track color in fill style', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context);
    const customColor: TrackColor = { r: 255, g: 0, b: 128 };
    const renderer = new SpectrogramCanvasRenderer(
      canvas,
      customColor,
      HEIGHT,
      HEIGHT_FACTOR,
    );

    renderer.drawSpectrogramFrame(new Uint8Array([128]), 0);

    expect(context.fillStyle).toBe(`rgba(255, 0, 128, ${128 / 256})`);
  });

  it('does nothing when canvas context is null', () => {
    const canvas = createMockCanvas(null);
    const renderer = new SpectrogramCanvasRenderer(
      canvas,
      COLOR,
      HEIGHT,
      HEIGHT_FACTOR,
    );

    // Should not throw
    renderer.drawSpectrogramFrame(new Uint8Array([128, 255]), 0);
  });
});
