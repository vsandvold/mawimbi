import { describe, expect, it } from 'vitest';

import { computeMeterRect } from '../loudnessMeterRenderer';

describe('computeMeterRect', () => {
  it('should produce a 2:1 width-to-height aspect ratio', () => {
    const rect = computeMeterRect(1000, 300);

    expect(rect.width).toBeGreaterThan(rect.height);
    expect(rect.width / rect.height).toBeCloseTo(2, 0);
  });

  it('should center the meter horizontally within the canvas', () => {
    const canvasWidth = 1000;
    const rect = computeMeterRect(canvasWidth, 300);

    const centerX = rect.x + rect.width / 2;
    expect(centerX).toBeCloseTo(canvasWidth / 2, 0);
  });

  it('should center the meter vertically within the canvas', () => {
    const canvasHeight = 300;
    const rect = computeMeterRect(1000, canvasHeight);

    const centerY = rect.y + rect.height / 2;
    expect(centerY).toBeCloseTo(canvasHeight / 2, 0);
  });
});
