import { vi } from 'vitest';
import { drawLiveColumn, dbToByte } from '../spectrogramRenderer';

describe('dbToByte', () => {
  it('returns 0 for values at or below MIN_DB', () => {
    expect(dbToByte(-80)).toBe(0);
    expect(dbToByte(-100)).toBe(0);
  });

  it('returns 255 for values at or above MAX_DB', () => {
    expect(dbToByte(-30)).toBe(255);
    expect(dbToByte(0)).toBe(255);
  });

  it('returns proportional value for mid-range dB', () => {
    // -55 dB is halfway between -80 and -30 → ~128
    expect(dbToByte(-55)).toBe(128);
  });
});

describe('drawLiveColumn', () => {
  function createMockCtx(canvasWidth = 100) {
    const fillRectCalls: { x: number; y: number; w: number; h: number }[] = [];
    const ctx = {
      canvas: { width: canvasWidth },
      save: vi.fn(),
      restore: vi.fn(),
      globalCompositeOperation: '',
      fillStyle: '',
      fillRect(x: number, y: number, w: number, h: number) {
        fillRectCalls.push({ x, y, w, h });
      },
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, fillRectCalls };
  }

  const WHITE = { r: 255, g: 255, b: 255 };

  it('applies logarithmic frequency mapping so low frequencies occupy more rows', () => {
    // 8 bins, canvas height 8. Only the lowest frequency bin (0) is loud.
    //
    // With logarithmic mapping for 8 bins, output bins 0, 1, and 2 all
    // map to input bin 0 — so three rows should be drawn, not one.
    const data = new Float32Array(8).fill(-100);
    data[0] = -30; // loud at lowest frequency

    const { ctx, fillRectCalls } = createMockCtx();

    drawLiveColumn(ctx, data, 50, 8, WHITE);

    // Logarithmic: output bins 0, 1, 2 all read from input bin 0
    // → 3 bright rows at the bottom of the canvas (y = 5, 6, 7)
    expect(fillRectCalls.length).toBe(3);
    const drawnYs = fillRectCalls.map((c) => c.y).sort((a, b) => a - b);
    expect(drawnYs).toEqual([5, 6, 7]);
  });

  it('compresses high-frequency bins into fewer rows', () => {
    // With logarithmic mapping for 8 bins, output bin 5 pools input
    // bins 2, 3, and 4. So if only input bin 3 has signal, output bin 5
    // (and only bin 5) should light up.
    const data = new Float32Array(8).fill(-100);
    data[3] = -30; // loud at input bin 3

    const { ctx, fillRectCalls } = createMockCtx();

    drawLiveColumn(ctx, data, 50, 8, WHITE);

    // Output bin 5 maps to input bins [2, 3, 4] → picks up the signal.
    // Row 5 → y = height - 5 - 1 = 2
    expect(fillRectCalls.length).toBe(1);
    expect(fillRectCalls[0].y).toBe(2);
  });
});
