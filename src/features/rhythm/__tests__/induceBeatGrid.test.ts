/**
 * `induceBeatGrid` is the whole of spec 008's rung-rendering claim at the
 * earliest falsifiable level (kb/verification.md level 1): the rungs render
 * the *induced* grid, so what has to be true is a property of this pure
 * function, not of any pixel.
 *
 * Three input populations, because the failure modes are opposites: a
 * renderer that draws raw ticks passes nothing here, a renderer that draws
 * one global BPM passes the steady and jittered cases but fails the
 * accelerando one, and a grid that follows every tick too eagerly passes
 * the accelerando case but fails the jitter one.
 *
 * The accelerando fixture's ground truth is imported rather than
 * re-derived — the same constants `generate-wav.mjs` wrote the audio from,
 * so the synthetic ticks here are the same beats real analysis sees.
 */
import { describe, expect, it } from 'vitest';
import { ACCELERANDO_CLICK_TIMES } from '../../../../e2e/fixtures/rhythmGroundTruth.mjs';
import {
  GRID_SMOOTHING_HALF_WINDOW,
  MIN_TICKS_FOR_GRID,
  induceBeatGrid,
  medianGridInterval,
} from '../induceBeatGrid';

const STEADY_BPM = 120;
const STEADY_INTERVAL = 60 / STEADY_BPM;
const STEADY_BEATS = 32;

// Floating-point summation slack only — the steady case must be isochronous
// to arithmetic precision, not merely "close".
const EXACT_EPSILON = 1e-9;

// Peak per-beat displacement of the synthetic jitter, matching the spec's
// "synthetic ±30 ms noise on a steady pulse" case.
const JITTER_SECONDS = 0.03;

function steadyTicks(count = STEADY_BEATS, start = 0): number[] {
  return Array.from({ length: count }, (_, i) => start + i * STEADY_INTERVAL);
}

/**
 * Deterministic pseudo-random jitter in `[-JITTER_SECONDS, JITTER_SECONDS]`.
 * A seeded LCG rather than `Math.random` so a failure is reproducible — and
 * rather than a smooth function of the index (a sine, say), which would be
 * periodic and could accidentally align with the smoothing window.
 */
function jitteredTicks(count = STEADY_BEATS): number[] {
  let seed = 20260725;
  return steadyTicks(count).map((tick, i) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    // The first tick keeps its position: it is the phase reference a
    // listener locks onto, and jittering it only obscures what the
    // assertions below are measuring.
    if (i === 0) return tick;
    return tick + ((seed / 2147483648) * 2 - 1) * JITTER_SECONDS;
  });
}

function intervalsOf(times: number[]): number[] {
  return times.slice(1).map((time, i) => time - times[i]);
}

describe('induceBeatGrid', () => {
  describe('steady ticks', () => {
    it('produces an exactly isochronous grid', () => {
      const grid = induceBeatGrid(steadyTicks());

      expect(grid).toHaveLength(STEADY_BEATS);
      for (const interval of intervalsOf(grid)) {
        expect(Math.abs(interval - STEADY_INTERVAL)).toBeLessThan(
          EXACT_EPSILON,
        );
      }
    });

    it('phase-aligns the grid to the played beats', () => {
      // A start offset the grid has no way to guess from the interval
      // alone — it can only come from the ticks' own phase.
      const ticks = steadyTicks(STEADY_BEATS, 0.137);
      const grid = induceBeatGrid(ticks);

      grid.forEach((gridTime, i) => {
        expect(Math.abs(gridTime - ticks[i])).toBeLessThan(EXACT_EPSILON);
      });
    });
  });

  describe('jittered ticks', () => {
    it('absorbs per-beat jitter into an isochronous grid', () => {
      const ticks = jitteredTicks();
      const grid = induceBeatGrid(ticks);

      const gridIntervals = intervalsOf(grid);
      const tickIntervals = intervalsOf(ticks);
      const spread = (values: number[]) =>
        Math.max(...values) - Math.min(...values);

      // The grid must be dramatically steadier than its input, not merely
      // steadier: raw ±30 ms jitter swings consecutive intervals by up to
      // 120 ms, and an implementation that passed a fraction of that
      // through would still be rendering jitter as if it were rhythm.
      expect(spread(gridIntervals)).toBeLessThan(spread(tickIntervals) / 10);
      for (const interval of gridIntervals) {
        expect(Math.abs(interval - STEADY_INTERVAL)).toBeLessThan(
          JITTER_SECONDS / 4,
        );
      }
    });

    it('keeps the grid phase-locked to the underlying pulse', () => {
      const grid = induceBeatGrid(jitteredTicks());
      const truth = steadyTicks();

      grid.forEach((gridTime, i) => {
        expect(Math.abs(gridTime - truth[i])).toBeLessThan(JITTER_SECONDS);
      });
    });
  });

  describe('accelerando ticks', () => {
    const ticks = ACCELERANDO_CLICK_TIMES as number[];
    const truthIntervals = intervalsOf(ticks);

    it('follows the drifting tempo instead of one global interval', () => {
      const grid = induceBeatGrid(ticks);
      const gridIntervals = intervalsOf(grid);

      // Each grid interval tracks the *local* ground-truth interval. A
      // single-global-BPM grid fails this at both ends (the fixture ramps
      // 100→140 BPM, i.e. 0.60 s → 0.43 s), and by far more than the
      // tolerance: the median interval alone is off by ~70 ms at the ends.
      //
      // 25 ms accommodates the documented clipped-window edge bias — the
      // first and last few intervals lag the ramp by up to ~20 ms (~4 px
      // at the default 200 px/s zoom), decaying to nothing within a bar.
      // See `windowed`'s comment for why that bias is preferred to the
      // alternatives.
      const LOCAL_INTERVAL_TOLERANCE_SECONDS = 0.025;
      gridIntervals.forEach((interval, i) => {
        expect(
          Math.abs(interval - truthIntervals[i]),
          `grid interval ${i} (${interval}s) is not within tolerance of the local ground-truth interval (${truthIntervals[i]}s)`,
        ).toBeLessThan(LOCAL_INTERVAL_TOLERANCE_SECONDS);
      });
    });

    it('changes spacing smoothly and monotonically', () => {
      const gridIntervals = intervalsOf(induceBeatGrid(ticks));

      // Monotone within a small slack: the smoothing window is a median
      // over a clipped window, so consecutive estimates can tie or wobble
      // by a fraction of a millisecond without the spacing ever visibly
      // reversing direction.
      const MONOTONICITY_SLACK_SECONDS = 0.001;
      // "Smoothly": no step between consecutive intervals larger than the
      // whole ramp's average per-beat step by more than a small factor.
      const totalDrift =
        gridIntervals[0] - gridIntervals[gridIntervals.length - 1];
      const maxStep = (4 * totalDrift) / gridIntervals.length;

      for (let i = 1; i < gridIntervals.length; i++) {
        const step = gridIntervals[i - 1] - gridIntervals[i];
        expect(
          step,
          `grid interval ${i} widened against an accelerando`,
        ).toBeGreaterThan(-MONOTONICITY_SLACK_SECONDS);
        expect(
          step,
          `grid spacing jumped between intervals ${i - 1} and ${i}`,
        ).toBeLessThan(maxStep);
      }
    });

    it('never drifts more than half an interval out of phase', () => {
      const grid = induceBeatGrid(ticks);

      grid.forEach((gridTime, i) => {
        const localInterval =
          truthIntervals[Math.min(i, truthIntervals.length - 1)];
        expect(
          Math.abs(gridTime - ticks[i]),
          `grid point ${i} drifted ${Math.abs(gridTime - ticks[i])}s from beat ${i}`,
        ).toBeLessThan(localInterval / 2);
      });
    });
  });

  describe('degenerate input', () => {
    it('returns nothing below the minimum tick count', () => {
      expect(induceBeatGrid([])).toEqual([]);
      expect(induceBeatGrid(steadyTicks(MIN_TICKS_FOR_GRID - 1))).toEqual([]);
      expect(induceBeatGrid(steadyTicks(MIN_TICKS_FOR_GRID))).toHaveLength(
        MIN_TICKS_FOR_GRID,
      );
    });

    it('drops non-finite and non-advancing ticks', () => {
      const ticks = steadyTicks();
      const corrupt = [
        ticks[0],
        Number.NaN,
        ticks[1],
        ticks[1], // duplicate
        ...ticks.slice(2),
      ];

      const grid = induceBeatGrid(corrupt);

      expect(grid).toHaveLength(ticks.length);
      for (const interval of intervalsOf(grid)) {
        expect(Math.abs(interval - STEADY_INTERVAL)).toBeLessThan(
          EXACT_EPSILON,
        );
      }
    });

    it('survives a run shorter than the smoothing window', () => {
      const short = steadyTicks(GRID_SMOOTHING_HALF_WINDOW - 1);

      const grid = induceBeatGrid(short);

      expect(grid).toHaveLength(short.length);
      grid.forEach((gridTime, i) => {
        expect(Math.abs(gridTime - short[i])).toBeLessThan(EXACT_EPSILON);
      });
    });
  });

  describe('medianGridInterval', () => {
    it('reports the grid spacing', () => {
      expect(medianGridInterval(induceBeatGrid(steadyTicks()))).toBeCloseTo(
        STEADY_INTERVAL,
        9,
      );
    });

    it('is zero without a grid', () => {
      expect(medianGridInterval([])).toBe(0);
      expect(medianGridInterval([1])).toBe(0);
    });
  });
});
