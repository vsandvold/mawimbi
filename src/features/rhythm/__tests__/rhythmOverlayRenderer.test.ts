import { describe, expect, it, vi } from 'vitest';
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
} from '../../workstation/workstationSignals';
import {
  EMPTY_BEAT_GRID,
  MIN_RUNG_SPACING_PX,
  RUNG_THICKNESS_PX,
  type RhythmOverlayViewport,
  buildBeatGrid,
  computeVisibleRungs,
  drawBeatRungs,
  visibleRungStride,
} from '../rhythmOverlayRenderer';

const PIXELS_PER_SECOND = 200;
const CANVAS_HEIGHT = 1000;
// Project time 0 sits below the canvas's bottom edge, so the visible span
// is a mid-track window rather than the take's opening — the ordinary case
// once anything has played.
const TIME_ZERO_Y = 1400;

const VIEWPORT: RhythmOverlayViewport = {
  timeZeroY: TIME_ZERO_Y,
  pixelsPerSecond: PIXELS_PER_SECOND,
  canvasWidth: 400,
  canvasHeight: CANVAS_HEIGHT,
};

/** A 120 BPM grid: 0.5 s apart, i.e. 100 px apart at 200 px/s. */
function steadyGrid(count: number, interval = 0.5) {
  return buildBeatGrid(Array.from({ length: count }, (_, i) => i * interval));
}

function makeContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D & {
    fillRect: ReturnType<typeof vi.fn>;
  };
}

describe('computeVisibleRungs', () => {
  it('places each rung at its project time, later times higher on screen', () => {
    const rungs = computeVisibleRungs(steadyGrid(8), 0, VIEWPORT);

    // Grid times 2.0 s … 3.5 s are the ones inside a 1000 px canvas whose
    // time-0 point is 1400 px below its top edge.
    expect(rungs.map((rung) => rung.time)).toEqual([2, 2.5, 3, 3.5]);
    expect(rungs.map((rung) => rung.y)).toEqual([1000, 900, 800, 700]);
  });

  it('offsets every rung by the anchor track start time', () => {
    // The #484 class (kb/domain.md): ticks are track-buffer relative, so an
    // anchor recorded as an overdub 1.25 s into the timeline has its whole
    // grid shifted by that. Without the offset every rung here would land
    // 250 px lower — visibly on the wrong beats, and invisible in testing
    // because every *uploaded* track has startTime 0.
    const START_TIME = 1.25;

    const rungs = computeVisibleRungs(steadyGrid(8), START_TIME, VIEWPORT);

    expect(rungs.map((rung) => rung.time)).toEqual([
      2.25, 2.75, 3.25, 3.75, 4.25, 4.75,
    ]);
    for (const rung of rungs) {
      expect(rung.y).toBe(TIME_ZERO_Y - rung.time * PIXELS_PER_SECOND);
    }
  });

  it('drops rungs outside the canvas window', () => {
    const rungs = computeVisibleRungs(steadyGrid(200), 0, VIEWPORT);

    for (const rung of rungs) {
      expect(rung.y).toBeGreaterThanOrEqual(0);
      expect(rung.y).toBeLessThanOrEqual(CANVAS_HEIGHT);
    }
    // 200 grid points span 100 s; only the ~10 s worth the canvas covers
    // may be produced.
    expect(rungs.length).toBeLessThan(15);
  });

  it('thins the grid by a stable stride rather than by position', () => {
    // At 50 px/s a 0.5 s grid is 25 px apart — below the spacing floor, so
    // every other rung is dropped. Which ones must depend on the grid
    // index alone, never on where the window happens to sit, or rungs
    // would swap on and off as the runway scrolls past them.
    const grid = steadyGrid(200);
    const zoomedOut = { ...VIEWPORT, pixelsPerSecond: MIN_PIXELS_PER_SECOND };

    const rungs = computeVisibleRungs(grid, 0, zoomedOut);
    const scrolled = computeVisibleRungs(grid, 0, {
      ...zoomedOut,
      timeZeroY: TIME_ZERO_Y + 137,
    });

    for (const rung of [...rungs, ...scrolled]) {
      expect(grid.times.indexOf(rung.time) % 2).toBe(0);
    }
  });

  it('produces nothing without a grid', () => {
    expect(computeVisibleRungs(EMPTY_BEAT_GRID, 0, VIEWPORT)).toEqual([]);
  });
});

describe('visibleRungStride', () => {
  const INTERVAL_120_BPM = 0.5;

  it('draws every rung when they are far enough apart', () => {
    expect(visibleRungStride(PIXELS_PER_SECOND, INTERVAL_120_BPM)).toBe(1);
  });

  it('thins the grid as spacing falls below the floor', () => {
    const spacingToPps = (spacingPx: number) => spacingPx / INTERVAL_120_BPM;

    expect(
      visibleRungStride(spacingToPps(MIN_RUNG_SPACING_PX), INTERVAL_120_BPM),
    ).toBe(1);
    expect(
      visibleRungStride(
        spacingToPps(MIN_RUNG_SPACING_PX - 1),
        INTERVAL_120_BPM,
      ),
    ).toBe(2);
    expect(
      visibleRungStride(
        spacingToPps(MIN_RUNG_SPACING_PX / 2 - 1),
        INTERVAL_120_BPM,
      ),
    ).toBe(4);
  });

  it('keeps drawn rungs above the spacing floor across the whole zoom range', () => {
    // The one property the LOD rule exists for, swept rather than sampled
    // (the `runwayConfig.test.ts` pattern): across every zoom the app
    // allows and every plausible tempo, thinned rungs must not merge.
    // 208 BPM is `RhythmAnalyser`'s own upper tempo bound.
    for (let pps = MIN_PIXELS_PER_SECOND; pps <= MAX_PIXELS_PER_SECOND; pps++) {
      for (let bpm = 40; bpm <= 208; bpm++) {
        const interval = 60 / bpm;
        const stride = visibleRungStride(pps, interval);
        const drawnSpacing = interval * stride * pps;
        // Only the fastest tempi at the lowest zoom can't be rescued by
        // the 4× cap; those still get the maximum available thinning.
        if (stride < 4) {
          expect(
            drawnSpacing,
            `${bpm} BPM at ${pps} px/s drew rungs ${drawnSpacing}px apart with stride ${stride}`,
          ).toBeGreaterThanOrEqual(MIN_RUNG_SPACING_PX);
        }
      }
    }
  });

  it('falls back to every rung for a degenerate spacing', () => {
    expect(visibleRungStride(PIXELS_PER_SECOND, 0)).toBe(1);
    expect(visibleRungStride(PIXELS_PER_SECOND, Number.NaN)).toBe(1);
    expect(visibleRungStride(PIXELS_PER_SECOND, -1)).toBe(1);
  });
});

describe('drawBeatRungs', () => {
  it('strokes one full-width line per visible rung', () => {
    const ctx = makeContext();

    drawBeatRungs(ctx, steadyGrid(8), 0, VIEWPORT);

    expect(ctx.fillRect.mock.calls).toEqual([
      [
        0,
        1000 - RUNG_THICKNESS_PX / 2,
        VIEWPORT.canvasWidth,
        RUNG_THICKNESS_PX,
      ],
      [0, 900 - RUNG_THICKNESS_PX / 2, VIEWPORT.canvasWidth, RUNG_THICKNESS_PX],
      [0, 800 - RUNG_THICKNESS_PX / 2, VIEWPORT.canvasWidth, RUNG_THICKNESS_PX],
      [0, 700 - RUNG_THICKNESS_PX / 2, VIEWPORT.canvasWidth, RUNG_THICKNESS_PX],
    ]);
  });

  it('draws nothing at all without a grid', () => {
    // Goal 7: with no rhythm data the runway must render exactly as it did
    // before this feature existed — which means not touching the context,
    // not just drawing zero rungs onto it.
    const ctx = makeContext();

    drawBeatRungs(ctx, EMPTY_BEAT_GRID, 0, VIEWPORT);

    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('draws nothing when the grid lies entirely outside the canvas', () => {
    const ctx = makeContext();

    drawBeatRungs(ctx, steadyGrid(3), 0, {
      ...VIEWPORT,
      timeZeroY: CANVAS_HEIGHT * 10,
    });

    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
