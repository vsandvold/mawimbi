import { describe, expect, it, vi } from 'vitest';

import { BeatPulse } from '../../../rhythm/BeatPulse';
import { BarSmoother } from '../barTransfer';
import {
  computeBarCenterX,
  computeCentredMeterRect,
  computeMeterRect,
  renderLoudnessMeterFrame,
  renderLoudnessMeterIdle,
} from '../loudnessMeterRenderer';

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

/**
 * A minimal 2D context. The drawing itself is deliberately untested (#365:
 * thin renderers over tested pure state); what these tests pin is the
 * *wiring* of the arrival envelope's lifecycle through the two entry
 * points, which is state, not appearance.
 */
function stubContext(): CanvasRenderingContext2D {
  return {
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    save: () => {},
    restore: () => {},
  } as unknown as CanvasRenderingContext2D;
}

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 200;
const WIDTH_FRACTION = 0.65;
const GRID = [0, 0.5, 1, 1.5];

function renderFrame(
  beatPulse: BeatPulse,
  engineTime: number,
  beatTimes: number[] = GRID,
): void {
  renderLoudnessMeterFrame(
    stubContext(),
    null,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    WIDTH_FRACTION,
    new BarSmoother(),
    [],
    engineTime,
    beatPulse,
    beatTimes,
  );
}

describe('arrival pulse lifecycle', () => {
  it('advances the envelope on every rendered frame', () => {
    // Not gated on `frequencyData` — this sandbox never delivers live
    // analysis frames (kb/verification.md, #542), and the pulse's inputs
    // are persisted data and the engine clock, so it renders regardless.
    const beatPulse = new BeatPulse();

    renderFrame(beatPulse, 0.9);
    renderFrame(beatPulse, 1.01);

    expect(beatPulse.level).toBeGreaterThan(0);
  });

  it('leaves the envelope at rest when there is no grid to pulse on', () => {
    const beatPulse = new BeatPulse();

    renderFrame(beatPulse, 0.9, []);
    renderFrame(beatPulse, 1.01, []);

    expect(beatPulse.level).toBe(0);
  });

  it('resets the envelope on the idle frame', () => {
    // The idle frame is drawn on every playback discontinuity, so this is
    // where pause/stop/seek clear the pulse (#483's lesson, applied at
    // design time). Nothing else calls `BeatPulse.reset()`.
    const beatPulse = new BeatPulse();
    renderFrame(beatPulse, 0.9);
    renderFrame(beatPulse, 1);
    expect(beatPulse.level).toBeGreaterThan(0);

    renderLoudnessMeterIdle(
      stubContext(),
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      WIDTH_FRACTION,
      new BarSmoother(),
      beatPulse,
    );

    expect(beatPulse.level).toBe(0);
    // …and the phase with it: resuming at the same moment must not treat
    // the beat already crossed as crossed again.
    renderFrame(beatPulse, 1);
    expect(beatPulse.level).toBe(0);
  });
});

// SPIKE (mawimbi#593) — String mode's meter geometry.
describe('computeCentredMeterRect', () => {
  it('centres the rect horizontally and vertically', () => {
    const rect = computeCentredMeterRect(400, 800);
    expect(rect.x + rect.width / 2).toBeCloseTo(200, 0);
    expect(rect.y + rect.height / 2).toBeCloseTo(400, 0);
  });

  it('holds a 3:4 width-to-height aspect', () => {
    const rect = computeCentredMeterRect(400, 800);
    expect(rect.width / rect.height).toBeCloseTo(3 / 4, 2);
  });

  // A narrow phone must shrink the meter, not clip it — so the width clamp
  // has to shrink the height with it or the aspect silently breaks.
  it('keeps the aspect when the width clamp binds', () => {
    const rect = computeCentredMeterRect(120, 2000);
    expect(rect.width).toBeLessThanOrEqual(120);
    expect(rect.width / rect.height).toBeCloseTo(3 / 4, 2);
  });

  it('never exceeds the canvas', () => {
    for (const [w, h] of [
      [320, 480],
      [1200, 400],
      [100, 100],
    ]) {
      const rect = computeCentredMeterRect(w, h);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(w);
      expect(rect.y + rect.height).toBeLessThanOrEqual(h);
    }
  });
});

describe('the string layout renders mirrored, vertically-flipped bars', () => {
  /** Records every fillRect the renderer issues. */
  function captureRects(frequencyData: Uint8Array) {
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    const ctx = {
      clearRect: vi.fn(),
      fillRect: vi.fn((x: number, y: number, w: number, h: number) =>
        rects.push({ x, y, w, h }),
      ),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      set fillStyle(_v: string) {},
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
      set shadowBlur(_v: number) {},
      set shadowColor(_v: string) {},
    } as unknown as CanvasRenderingContext2D;

    renderLoudnessMeterFrame(
      ctx,
      frequencyData,
      400,
      800,
      0.8,
      new BarSmoother(),
      [],
      0,
      new BeatPulse(),
      [],
      'string',
    );
    const rect = computeCentredMeterRect(400, 800);
    // The background is itself a fillRect at exactly the meter rect — drop
    // it so only bars are under test.
    const bars = rects.filter(
      (r) => !(r.x === rect.x && r.y === rect.y && r.w === rect.width),
    );
    return { bars, rect };
  }

  /** One loud bin near the bottom of the range, one near the top. */
  function twoToneFrame(): Uint8Array {
    const data = new Uint8Array(200);
    data[8] = 255;
    data[9] = 255;
    data[180] = 255;
    data[181] = 255;
    return data;
  }

  it('mirrors each magnitude about the rect vertical centre line', () => {
    const { bars, rect } = captureRects(twoToneFrame());
    const centreX = rect.x + rect.width / 2;
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      // Symmetric: the bar's own centre is the rect's centre line.
      expect(bar.x + bar.w / 2).toBeCloseTo(centreX, 6);
    }
  });

  it('puts the low bin below the high bin, matching the ribbons', () => {
    const { bars } = captureRects(twoToneFrame());
    expect(bars.length).toBeGreaterThanOrEqual(2);
    const ys = bars.map((b) => b.y).sort((a, b) => a - b);
    // Two clusters; the low-frequency one must be the *larger* y (lower on
    // screen). Falsified by indexing bars downward from the top.
    const lowestBinBar = bars[0];
    const highestBinBar = bars[bars.length - 1];
    expect(lowestBinBar.y).toBeGreaterThan(highestBinBar.y);
    expect(ys[0]).toBeLessThan(ys[ys.length - 1]);
  });

  it('draws no bars for a silent frame', () => {
    const { bars } = captureRects(new Uint8Array(200));
    expect(bars).toHaveLength(0);
  });
});
