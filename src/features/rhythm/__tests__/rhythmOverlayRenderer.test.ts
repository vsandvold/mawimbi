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
  MIN_ONSET_TICK_OPACITY,
  MIN_RUNG_SPACING_PX,
  MIN_TICK_SPACING_PX,
  ONSET_TICK_LENGTH_PX,
  ONSET_TICK_OPACITY,
  ONSET_TICK_THICKNESS_PX,
  PHANTOM_RUNG_COLOR,
  PHANTOM_RUNG_OPACITY,
  RUNG_COLOR,
  RUNG_OPACITY,
  RUNG_THICKNESS_PX,
  type RhythmOverlayViewport,
  buildBeatGrid,
  computeVisibleOnsetTicks,
  computeVisiblePhantomRungs,
  computeVisibleRungs,
  drawBeatRungs,
  drawOnsetTicks,
  drawPhantomRungs,
  onsetTickOpacity,
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
// Phantom rungs — the pulse continued past detection (spec 008 Goal 5, #572)
// ---------------------------------------------------------------------------

describe('phantom rungs', () => {
  /**
   * A confident 120 BPM grid that ends at 4.5 s — early enough that its
   * whole continuation still falls inside the canvas window, which is what
   * makes the placements below readable at all.
   */
  const CONTINUED_GRID = buildBeatGrid(
    Array.from({ length: 10 }, (_, i) => i * 0.5),
    { bpm: 120, confidence: 5 },
  );

  it('places the continuation past the last rung, at the grid interval', () => {
    const rungs = computeVisibleRungs(CONTINUED_GRID, 0, VIEWPORT);
    const phantoms = computeVisiblePhantomRungs(CONTINUED_GRID, 0, VIEWPORT);

    const lastRungY = Math.min(...rungs.map((rung) => rung.y));
    expect(phantoms.map((phantom) => phantom.y)).toEqual([
      lastRungY - 100,
      lastRungY - 200,
      lastRungY - 300,
      lastRungY - 400,
    ]);
  });

  it('applies the anchor start time like every other mark', () => {
    // The #484 class again: an overdub anchor's continuation has to move
    // with its grid, or the ghost detaches from the pulse it continues.
    const START_TIME = 1.25;

    const phantoms = computeVisiblePhantomRungs(
      CONTINUED_GRID,
      START_TIME,
      VIEWPORT,
    );

    expect(phantoms.length).toBeGreaterThan(0);
    for (const phantom of phantoms) {
      expect(phantom.y).toBe(TIME_ZERO_Y - phantom.time * PIXELS_PER_SECOND);
      expect(phantom.time).toBeGreaterThan(START_TIME);
    }
  });

  it('continues the drawn density, in phase, when the grid is thinned', () => {
    // At 50 px/s a 0.5 s grid is 25 px apart, so only every other rung is
    // drawn (`visibleRungStride`). The ghost has to continue *that*
    // sequence: same spacing, and landing where the next drawn rung would
    // have, not one beat off it.
    const zoomedOut = {
      ...VIEWPORT,
      pixelsPerSecond: MIN_PIXELS_PER_SECOND,
      // The whole grid plus its continuation spans 6 s, which is 300 px at
      // this zoom — the window has to start there to hold both.
      timeZeroY: 300,
    };

    const rungs = computeVisibleRungs(CONTINUED_GRID, 0, zoomedOut);
    const phantoms = computeVisiblePhantomRungs(CONTINUED_GRID, 0, zoomedOut);

    const lastRungTime = Math.max(...rungs.map((rung) => rung.time));
    expect(phantoms.map((phantom) => phantom.time)).toEqual([
      lastRungTime + 1,
      lastRungTime + 2,
    ]);
  });

  it('produces nothing for a grid with no continuation', () => {
    // The unconfident case, and the reason `buildBeatGrid`'s tempo argument
    // is optional: no confident estimate, no ghost (`extrapolateTicks`).
    expect(
      computeVisiblePhantomRungs(
        buildBeatGrid(steadyGrid(10).times),
        0,
        VIEWPORT,
      ),
    ).toEqual([]);
    expect(computeVisiblePhantomRungs(EMPTY_BEAT_GRID, 0, VIEWPORT)).toEqual(
      [],
    );
  });

  it('strokes the continuation fainter than the detected grid', () => {
    const ctx = makeContext();
    const fillStyles: string[] = [];
    // `fillStyle` is a single mutable property, so the colour in force at
    // each stroke is only observable as it is used.
    ctx.fillRect.mockImplementation(() =>
      fillStyles.push(String(ctx.fillStyle)),
    );

    drawBeatRungs(ctx, CONTINUED_GRID, 0, VIEWPORT);
    const rungCalls = fillStyles.length;
    drawPhantomRungs(ctx, CONTINUED_GRID, 0, VIEWPORT);

    expect(rungCalls).toBeGreaterThan(0);
    expect(fillStyles.slice(0, rungCalls)).toEqual(
      new Array(rungCalls).fill(RUNG_COLOR),
    );
    expect(fillStyles.slice(rungCalls)).toEqual(
      new Array(fillStyles.length - rungCalls).fill(PHANTOM_RUNG_COLOR),
    );
    expect(PHANTOM_RUNG_OPACITY).toBeLessThan(RUNG_OPACITY / 2);
  });

  it('draws nothing at all without a continuation', () => {
    // Goal 7 again: the cuttable layer must cost a project without one
    // exactly nothing, not an empty save/restore pair.
    const ctx = makeContext();

    drawPhantomRungs(ctx, EMPTY_BEAT_GRID, 0, VIEWPORT);

    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.save).not.toHaveBeenCalled();
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

  it('drops a non-finite onset instead of placing it at NaN', () => {
    // Only the grid's times are sanitized upstream (`induceBeatGrid`'s
    // `sanitizeTicks`); onsets reach the renderer straight off a worker
    // result or a persisted row. A `y < 0 || y > h` cull is *false* for
    // `NaN`, so the naive form emits a `NaN` placement that `fillRect`
    // silently ignores — the mark is missing while the caller's
    // "nothing to draw" early return is defeated on every frame
    // (`/code-review` on PR #587).
    const ticks = computeVisibleOnsetTicks(
      [2, Number.NaN, 2.5, Number.POSITIVE_INFINITY, 3],
      0,
      VIEWPORT,
    );

    expect(ticks.map((tick) => tick.time)).toEqual([2, 2.5, 3]);
    expect(ticks.every((tick) => Number.isFinite(tick.y))).toBe(true);
  });

  it('draws nothing when every onset is non-finite', () => {
    const ctx = makeContext();

    drawOnsetTicks(ctx, [Number.NaN, Number.NaN], 0, TRACK_COLOR, VIEWPORT);

    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});

describe('onsetTickOpacity', () => {
  it('draws at full strength while ticks read as separate marks', () => {
    expect(onsetTickOpacity(MIN_TICK_SPACING_PX)).toBe(ONSET_TICK_OPACITY);
    expect(onsetTickOpacity(100)).toBe(ONSET_TICK_OPACITY);
  });

  it('fades as ticks crowd together, never past the floor', () => {
    const crowded = onsetTickOpacity(MIN_TICK_SPACING_PX / 2);
    expect(crowded).toBeLessThan(ONSET_TICK_OPACITY);
    expect(crowded).toBeGreaterThanOrEqual(MIN_ONSET_TICK_OPACITY);

    // The case the rule exists for: a dense track (~10 onsets/s, spec
    // Decision 1) at the zoom floor puts marks 5 px apart while they are
    // 2.5 px thick — a solid bar down the rail at full alpha.
    const denseSpacingPx = MIN_PIXELS_PER_SECOND / 10;
    expect(onsetTickOpacity(denseSpacingPx)).toBeLessThan(ONSET_TICK_OPACITY);
    expect(onsetTickOpacity(denseSpacingPx)).toBeGreaterThanOrEqual(
      MIN_ONSET_TICK_OPACITY,
    );
  });

  it('never fades to invisible on a degenerate spacing', () => {
    // A single visible tick has no spacing to measure; fading it out would
    // hide the one mark the track has.
    expect(onsetTickOpacity(0)).toBe(ONSET_TICK_OPACITY);
    expect(onsetTickOpacity(Number.NaN)).toBe(ONSET_TICK_OPACITY);
    expect(onsetTickOpacity(-1)).toBe(ONSET_TICK_OPACITY);
  });

  it('stays monotonic across the crowding range', () => {
    for (let spacing = 1; spacing < MIN_TICK_SPACING_PX * 2; spacing++) {
      expect(onsetTickOpacity(spacing)).toBeLessThanOrEqual(
        onsetTickOpacity(spacing + 1),
      );
    }
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

  it('fades a crowded rail rather than dropping any of its onsets', () => {
    // Wires `onsetTickOpacity` to the actual draw — without this the fade
    // function could be correct and unused. ~50 onsets/s across the visible
    // window puts marks ~4 px apart, well inside the crowded range.
    const ctx = makeContext();
    const dense = Array.from({ length: 251 }, (_, i) => 2 + i * 0.02);

    drawOnsetTicks(ctx, dense, 0, TRACK_COLOR, VIEWPORT);

    const drawn = ctx.fillRect.mock.calls.length / 2;
    expect(drawn).toBe(dense.length);
    const opacity = Number(
      String(ctx.fillStyle).match(/([\d.]+)\)$/)?.[1] ?? Number.NaN,
    );
    expect(opacity).toBe(onsetTickOpacity(CANVAS_HEIGHT / dense.length));
    expect(opacity).toBeLessThan(ONSET_TICK_OPACITY);
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
