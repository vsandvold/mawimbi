import { describe, expect, it } from 'vitest';

import { computeBarCenterX, computeMeterRect } from '../loudnessMeterRenderer';

describe('computeMeterRect', () => {
  it('uses the geometry-derived width fraction of the canvas width', () => {
    const canvasWidth = 1000;
    const rect = computeMeterRect(canvasWidth, 400, 0.65);

    expect(rect.width).toBe(Math.round(canvasWidth * 0.65));
  });

  it('spans the full canvas width at fraction 1 (flat/reduced motion)', () => {
    const rect = computeMeterRect(1000, 600, 1);

    expect(rect.width).toBe(1000);
    expect(rect.x).toBe(0);
  });

  it('produces a 3:1 width-to-height aspect ratio when it fits', () => {
    const rect = computeMeterRect(1000, 400, 0.65);

    expect(rect.width).toBeGreaterThan(rect.height);
    expect(rect.width / rect.height).toBeCloseTo(3, 0);
  });

  it('clamps the height to the canvas height on wide canvases', () => {
    const canvasHeight = 200;
    const rect = computeMeterRect(2000, canvasHeight, 0.65);

    expect(rect.height).toBe(canvasHeight);
  });

  it('centers the meter horizontally within the canvas', () => {
    const canvasWidth = 1000;
    const rect = computeMeterRect(canvasWidth, 400, 0.65);

    const centerX = rect.x + rect.width / 2;
    expect(centerX).toBeCloseTo(canvasWidth / 2, 0);
  });

  it('bottom-aligns the meter within the canvas', () => {
    const canvasHeight = 400;
    const rect = computeMeterRect(1000, canvasHeight, 0.65);

    expect(rect.y + rect.height).toBe(canvasHeight);
  });

  it('bottom-aligns the meter even when the height clamp engages', () => {
    const canvasHeight = 200;
    const rect = computeMeterRect(2000, canvasHeight, 0.65);

    expect(rect.y + rect.height).toBe(canvasHeight);
  });
});

describe('computeBarCenterX', () => {
  it('centers bar 0 inside the rect, right of the border padding', () => {
    const rect = computeMeterRect(1000, 400, 0.65);
    const centerX = computeBarCenterX(rect, 100, 0);

    expect(centerX).toBeGreaterThan(rect.x);
    expect(centerX).toBeLessThan(rect.x + rect.width);
  });

  it('increases monotonically with bar index', () => {
    const rect = computeMeterRect(1000, 400, 0.65);
    const x0 = computeBarCenterX(rect, 100, 0);
    const x50 = computeBarCenterX(rect, 100, 50);
    const x99 = computeBarCenterX(rect, 100, 99);

    expect(x50).toBeGreaterThan(x0);
    expect(x99).toBeGreaterThan(x50);
  });

  it('returns the rect center for zero bars', () => {
    const rect = computeMeterRect(1000, 400, 0.65);

    expect(computeBarCenterX(rect, 0, 0)).toBe(rect.x + rect.width / 2);
  });
});
