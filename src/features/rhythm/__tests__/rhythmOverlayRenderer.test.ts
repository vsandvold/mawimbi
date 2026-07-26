import { describe, expect, it, vi } from 'vitest';
import {
  SWUNG_CLICK,
  computeIsochronousClickTimes,
  computeSwungClickTimes,
} from '../../../../e2e/fixtures/rhythmGroundTruth.mjs';
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
} from '../../workstation/workstationSignals';
import { type TrackColor } from '../../tracks/types';
import { induceBeatGrid } from '../induceBeatGrid';
import {
  EMPTY_BEAT_GRID,
  MIN_RUNG_SPACING_PX,
  ONSET_TICK_LENGTH_PX,
  ONSET_TICK_OPACITY,
  ONSET_TICK_THICKNESS_PX,
  RUNG_THICKNESS_PX,
  type RhythmOverlayViewport,
  buildBeatGrid,
  computeVisibleOnsetTicks,
  computeVisibleRungs,
  drawBeatRungs,
  drawOnsetTicks,
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

// ---------------------------------------------------------------------------
// Onset ticks — the nuance layer (spec 008 Goal 3, milestone 4)
// ---------------------------------------------------------------------------

const TRACK_COLOR: TrackColor = { r: 77, g: 238, b: 234 };

/** Distance from `y` to the nearest rung of `grid`, in pixels. */
function distanceToNearestRung(
  grid: ReturnType<typeof buildBeatGrid>,
  startTime: number,
  y: number,
): number {
  const rungs = computeVisibleRungs(grid, startTime, VIEWPORT);
  return Math.min(...rungs.map((rung) => Math.abs(rung.y - y)));
}

describe('computeVisibleOnsetTicks', () => {
  it('places each onset at its project time, on the same rows the rungs use', () => {
    const onsets = computeIsochronousClickTimes(120, 16);

    const ticks = computeVisibleOnsetTicks(onsets, 0, VIEWPORT);

    expect(ticks.map((tick) => tick.time)).toEqual([
      2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7,
    ]);
    expect(ticks.map((tick) => tick.y)).toEqual([
      1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 0,
    ]);
    // The layer's whole claim is that ticks and rungs are read against each
    // other, which only holds if both project time the same way: a track
    // whose onsets *are* the beats must put every tick on a rung.
    for (const tick of ticks) {
      expect(distanceToNearestRung(buildBeatGrid(onsets), 0, tick.y)).toBe(0);
    }
  });

  it('offsets every tick by the track start time', () => {
    // The #484 class (kb/domain.md), again: onsets are track-buffer
    // relative, so an overdub's ticks are shifted by its own start. Without
    // this every tick below would land 250 px lower — on the wrong beats,
    // and invisible in testing because every *uploaded* track starts at 0.
    const START_TIME = 1.25;
    const onsets = computeIsochronousClickTimes(120, 16);

    const ticks = computeVisibleOnsetTicks(onsets, START_TIME, VIEWPORT);

    expect(ticks.map((tick) => tick.time)).toEqual([
      2.25, 2.75, 3.25, 3.75, 4.25, 4.75, 5.25, 5.75, 6.25, 6.75,
    ]);
    for (const tick of ticks) {
      expect(tick.y).toBe(TIME_ZERO_Y - tick.time * PIXELS_PER_SECOND);
    }
  });

  it('drops onsets outside the canvas window', () => {
    const ticks = computeVisibleOnsetTicks(
      computeIsochronousClickTimes(120, 400),
      0,
      VIEWPORT,
    );

    for (const tick of ticks) {
      expect(tick.y).toBeGreaterThanOrEqual(0);
      expect(tick.y).toBeLessThanOrEqual(CANVAS_HEIGHT);
    }
    // 400 onsets span 200 s; only the 5 s the canvas covers may be drawn.
    expect(ticks.length).toBeLessThan(15);
  });

  it('keeps every onset when the grid above it is being thinned', () => {
    // The LOD stride is a property of the *grid*'s density (spec Decision
    // 2). Dropping onsets by the same rule would delete events that
    // happened, so a zoom level that halves the rungs must still show every
    // tick — otherwise zooming out would silently rewrite the performance.
    const zoomedOut = { ...VIEWPORT, pixelsPerSecond: MIN_PIXELS_PER_SECOND };
    const onsets = computeIsochronousClickTimes(120, 200);

    const ticks = computeVisibleOnsetTicks(onsets, 0, zoomedOut);
    const rungs = computeVisibleRungs(buildBeatGrid(onsets), 0, zoomedOut);

    expect(visibleRungStride(MIN_PIXELS_PER_SECOND, 0.5)).toBe(2);
    expect(ticks.length).toBeGreaterThan(rungs.length);
    // …and the ones that survive the thinning are still tick times, so a
    // drawn rung always has a tick to be read against.
    const tickTimes = ticks.map((tick) => tick.time);
    for (const rung of rungs) expect(tickTimes).toContain(rung.time);
  });

  it('produces nothing without onsets', () => {
    expect(computeVisibleOnsetTicks([], 0, VIEWPORT)).toEqual([]);
  });
});

describe('onset ticks against the induced grid', () => {
  it('renders a swung eighth off the rung it swings against', () => {
    // The geometry-is-the-annotation claim (spec Goal 3): the fixture's
    // beats induce the grid, and its off-beat eighths must land visibly
    // *between* rungs. Falsified by any implementation that snapped ticks
    // to the grid — every tick would sit on a rung with distance 0.
    const beatTimes = computeIsochronousClickTimes(
      SWUNG_CLICK.bpm,
      SWUNG_CLICK.numBeats,
    );
    const grid = buildBeatGrid(induceBeatGrid(beatTimes));
    const onsets = computeSwungClickTimes(
      SWUNG_CLICK.bpm,
      SWUNG_CLICK.numBeats,
      SWUNG_CLICK.swingRatio,
    );
    const beatSeconds = 60 / SWUNG_CLICK.bpm;
    // The "and" sits 62% through the beat, so its nearest rung is the
    // *next* one, 38% of a beat later — 38 px at this zoom.
    const expectedOffsetPx =
      (1 - SWUNG_CLICK.swingRatio) * beatSeconds * PIXELS_PER_SECOND;

    const ticks = computeVisibleOnsetTicks(onsets, 0, VIEWPORT);
    expect(ticks.length).toBeGreaterThan(4);

    for (const tick of ticks) {
      const isDownbeat =
        Math.abs(
          tick.time / beatSeconds - Math.round(tick.time / beatSeconds),
        ) < 1e-9;
      const offset = distanceToNearestRung(grid, 0, tick.y);
      if (isDownbeat) {
        expect(
          offset,
          `downbeat tick at ${tick.time}s left its rung`,
        ).toBeLessThan(1);
      } else {
        expect(
          offset,
          `swung eighth at ${tick.time}s rendered ${offset.toFixed(1)}px from a rung`,
        ).toBeCloseTo(expectedOffsetPx, 1);
      }
    }
  });

  it("renders the anchor's own push against its induced grid", () => {
    // The amendment's point (spec Decision 2): the grid is *induced* from
    // the beat tracker's ticks, not drawn from the onsets, so an anchor
    // that consistently plays ahead of its own tracked beat shows that
    // offset rather than sitting on its own rungs by construction.
    const PUSH_SECONDS = 0.03;
    const beatTimes = computeIsochronousClickTimes(120, 32);
    const grid = buildBeatGrid(induceBeatGrid(beatTimes));
    const onsets = beatTimes.map((time) => time - PUSH_SECONDS);

    const ticks = computeVisibleOnsetTicks(onsets, 0, VIEWPORT);
    expect(ticks.length).toBeGreaterThan(4);

    // Earlier in time is *lower* on the canvas (`y = timeZeroY − t × pps`),
    // so a push renders below its rung by exactly the push.
    for (const tick of ticks) {
      const rungY = tick.y - PUSH_SECONDS * PIXELS_PER_SECOND;
      expect(
        distanceToNearestRung(grid, 0, rungY),
        `pushed tick at ${tick.time}s is not ${PUSH_SECONDS}s ahead of a rung`,
      ).toBeLessThan(1);
      expect(distanceToNearestRung(grid, 0, tick.y)).toBeCloseTo(
        PUSH_SECONDS * PIXELS_PER_SECOND,
        1,
      );
    }
  });
});

describe('drawOnsetTicks', () => {
  it('strokes a short mark at each rail for every visible onset', () => {
    const ctx = makeContext();

    // Two onsets inside the canvas window, so the expected call list below
    // stays readable while still covering both rails on both marks.
    drawOnsetTicks(ctx, [2, 2.5], 0, TRACK_COLOR, VIEWPORT);

    const halfThickness = ONSET_TICK_THICKNESS_PX / 2;
    const rightX = VIEWPORT.canvasWidth - ONSET_TICK_LENGTH_PX;
    expect(ctx.fillRect.mock.calls).toEqual([
      [0, 1000 - halfThickness, ONSET_TICK_LENGTH_PX, ONSET_TICK_THICKNESS_PX],
      [
        rightX,
        1000 - halfThickness,
        ONSET_TICK_LENGTH_PX,
        ONSET_TICK_THICKNESS_PX,
      ],
      [0, 900 - halfThickness, ONSET_TICK_LENGTH_PX, ONSET_TICK_THICKNESS_PX],
      [
        rightX,
        900 - halfThickness,
        ONSET_TICK_LENGTH_PX,
        ONSET_TICK_THICKNESS_PX,
      ],
    ]);
    expect(ctx.fillStyle).toBe(
      `rgba(${TRACK_COLOR.r}, ${TRACK_COLOR.g}, ${TRACK_COLOR.b}, ${ONSET_TICK_OPACITY})`,
    );
  });

  it('draws in the track color, so focus and mute treatment read as the track', () => {
    const ctx = makeContext();
    const other: TrackColor = { r: 255, g: 231, b: 0 };

    drawOnsetTicks(ctx, [2.5], 0, other, VIEWPORT);

    expect(ctx.fillStyle).toBe(
      `rgba(${other.r}, ${other.g}, ${other.b}, ${ONSET_TICK_OPACITY})`,
    );
  });

  it('draws nothing at all without onsets', () => {
    // Goal 7: a track with no rhythm data must render exactly as it did
    // before this feature existed — not touching the context, not merely
    // drawing zero ticks onto it.
    const ctx = makeContext();

    drawOnsetTicks(ctx, [], 0, TRACK_COLOR, VIEWPORT);

    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('draws nothing when every onset lies outside the canvas', () => {
    const ctx = makeContext();

    drawOnsetTicks(ctx, [0, 0.5, 1], 0, TRACK_COLOR, {
      ...VIEWPORT,
      timeZeroY: CANVAS_HEIGHT * 10,
    });

    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
