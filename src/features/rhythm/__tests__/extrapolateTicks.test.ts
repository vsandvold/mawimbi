/**
 * Phantom rung continuation (spec 008 milestone 6, #572).
 *
 * The claims here are all about *what times* the pulse is continued at, so
 * they are level-1 by construction (kb/verification.md): a pure function of
 * the induced grid, with no canvas, no clock and no analysis in the way.
 * What a unit test cannot settle — that the continuation actually paints,
 * fainter than the detection-backed rungs, past the last tracked beat — is
 * `e2e/rhythm-runway.spec.ts`'s.
 */
import { describe, expect, it } from 'vitest';
import { ACCELERANDO_CLICK_TIMES } from '../../../../e2e/fixtures/rhythmGroundTruth.mjs';
import {
  LOCAL_INTERVAL_WINDOW_BEATS,
  PHANTOM_HORIZON_BEATS,
  extrapolateTicks,
} from '../extrapolateTicks';
import { induceBeatGrid } from '../induceBeatGrid';
import { MIN_TEMPO_CONFIDENCE, type TrackTempo } from '../tempo';

const CONFIDENT: TrackTempo = { bpm: 120, confidence: MIN_TEMPO_CONFIDENCE };

/** A steady grid: `count` points `interval` seconds apart, starting at 0. */
function steadyGrid(count: number, interval = 0.5): number[] {
  return Array.from({ length: count }, (_, i) => i * interval);
}

function intervals(times: number[]): number[] {
  return times.slice(1).map((time, i) => time - times[i]);
}

describe('extrapolateTicks', () => {
  it('continues a steady grid at its own interval', () => {
    const grid = steadyGrid(16);

    const phantoms = extrapolateTicks(grid, CONFIDENT);

    expect(phantoms).toEqual([7.5 + 0.5, 7.5 + 1, 7.5 + 1.5, 7.5 + 2]);
  });

  it('stops at the horizon rather than continuing indefinitely', () => {
    const phantoms = extrapolateTicks(steadyGrid(64), CONFIDENT);

    expect(phantoms).toHaveLength(PHANTOM_HORIZON_BEATS);
    // The bound is a *time* horizon, so it has to hold whatever the tempo:
    // a slow pulse continues no further in beats than a fast one.
    expect(extrapolateTicks(steadyGrid(64, 1.5), CONFIDENT)).toHaveLength(
      PHANTOM_HORIZON_BEATS,
    );
  });

  it('takes the interval from the recent local tempo, not the whole take', () => {
    // A take that starts at 120 BPM and ends at 60: the global average
    // interval is nowhere near either end's. Only the tail may set the
    // continuation's spacing — a phantom rung is a claim about what happens
    // *next*, and what happened a minute ago has no bearing on it.
    const accelerating = [0];
    for (let beat = 0; beat < 40; beat++) {
      accelerating.push(
        accelerating[beat] + (beat < 20 ? 0.5 : 1) /* seconds */,
      );
    }

    const phantoms = extrapolateTicks(accelerating, CONFIDENT);

    for (const interval of intervals([
      accelerating[accelerating.length - 1],
      ...phantoms,
    ])) {
      expect(interval).toBeCloseTo(1, 6);
    }
  });

  it('follows a drifting tempo rather than the global BPM', () => {
    // The accelerando fixture's own ground truth (100 → 140 BPM), run
    // through the real regularization. The two candidate answers are far
    // apart — 0.43 s locally against a 0.51 s global mean — so an
    // implementation that reached for the take's average tempo, or for
    // `bpm`, fails here rather than merely being imprecise.
    const grid = induceBeatGrid(ACCELERANDO_CLICK_TIMES);
    const localIntervals = intervals(grid).slice(-LOCAL_INTERVAL_WINDOW_BEATS);
    const localInterval =
      localIntervals.reduce((total, value) => total + value, 0) /
      localIntervals.length;
    const globalInterval =
      (grid[grid.length - 1] - grid[0]) / (grid.length - 1);

    const phantoms = extrapolateTicks(grid, CONFIDENT);

    expect(globalInterval - localInterval).toBeGreaterThan(0.05);
    for (const interval of intervals([grid[grid.length - 1], ...phantoms])) {
      expect(interval).toBeCloseTo(localInterval, 2);
    }
  });

  it('rejects a single mis-tracked final beat', () => {
    // A tempo read off the last interval alone would continue at whatever
    // that beat happened to be, drawing four rungs at a tempo the music
    // never played. The median has to ignore it.
    const grid = steadyGrid(16);
    grid[grid.length - 1] += 0.4;

    const phantoms = extrapolateTicks(grid, CONFIDENT);

    for (const interval of intervals([grid[grid.length - 1], ...phantoms])) {
      expect(interval).toBeCloseTo(0.5, 6);
    }
  });

  it('never lands on a detected grid point', () => {
    // The layer's whole claim is that these rungs are *not* backed by
    // detection, so a phantom coinciding with a real grid point would
    // render a detected beat as a guess (spec Decision 5: never rendered
    // where detected ticks back the grid).
    const grid = steadyGrid(16);

    const phantoms = extrapolateTicks(grid, CONFIDENT);

    for (const phantom of phantoms) {
      expect(phantom).toBeGreaterThan(grid[grid.length - 1]);
      for (const gridTime of grid) {
        expect(Math.abs(phantom - gridTime)).toBeGreaterThan(0.25);
      }
    }
  });

  it('produces nothing without a confident tempo', () => {
    const grid = steadyGrid(16);

    // The same gate as `selectRhythmAnchor` (`isConfidentTempo`), so the
    // grid and its continuation can never disagree about whether this
    // track's pulse is worth rendering.
    expect(
      extrapolateTicks(grid, {
        bpm: 120,
        confidence: MIN_TEMPO_CONFIDENCE - 0.01,
      }),
    ).toEqual([]);
    expect(extrapolateTicks(grid, undefined)).toEqual([]);
    expect(extrapolateTicks(grid, { bpm: Number.NaN, confidence: 5 })).toEqual(
      [],
    );
  });

  it('produces nothing without a grid to continue', () => {
    expect(extrapolateTicks([], CONFIDENT)).toEqual([]);
    expect(extrapolateTicks([1.5], CONFIDENT)).toEqual([]);
    // A grid whose points don't advance yields no interval — continuing it
    // by a zero or negative step would walk backwards into the detected
    // rungs.
    expect(extrapolateTicks([1.5, 1.5, 1.5], CONFIDENT)).toEqual([]);
  });
});
