// extrapolateTicks — continues the induced pulse past the last detected
// beat, as the ghosted phantom rungs (spec 008 Goal 5 / Decision 5, #572).
//
// Meter is induced retrospectively from recent onsets and *felt as
// continuing* (kb/product.md, the runway-as-echoic-memory frame). Where the
// anchor's beat tracking has run out — the take ended, the drummer stopped
// — the listener's pulse has not, so rendering nothing there under-reports
// the percept. Rendering it at full strength would over-report it, which is
// why the phantom rungs are a distinctly fainter layer
// (`PHANTOM_RUNG_OPACITY`) at a bounded horizon: an expectation, drawn as
// an expectation.
//
// Extrapolation and regularization share one mechanism, which is the point
// — the grid *is* the induced expectation, so continuing it is the same
// local-interval estimate `induceBeatGrid` already maintains, run one step
// further. Nothing here is persisted, for the same reason nothing about the
// grid is: it is a pure function of the persisted ticks.
//
// Scope note (#572): the milestone's "or across a detected gap" case is
// *not* implemented here, deliberately. Two measurements say it has no
// subject. essentia's tracker does not stop emitting ticks when the beats
// stop — on `test-click-then-continue.wav` (16 clicks, then 10 s of
// non-percussive tone) it coasts through the whole tail, returning 32 ticks
// across the full 17.5 s file — so a detection gap does not reach the grid
// from any fixture this repo has. And when a gap *is* injected
// synthetically, `induceBeatGrid` does not leave a hole to fill: it spreads
// the missing beats' time across the surrounding grid points (a 4 s gap in
// a 0.5 s pulse became nine points spaced 0.889 s apart), so there is no
// gap for a second pass to detect. Filling gaps properly means changing M3's
// regularization to work from the raw ticks, which is a different change
// with its own evidence — not a clause of a cuttable stretch milestone.

import { GRID_SMOOTHING_HALF_WINDOW } from './induceBeatGrid';
import { isConfidentTempo, type TrackTempo } from './tempo';

/**
 * How far past the last detected beat the pulse is continued, in grid
 * intervals.
 *
 * The bound is the honesty budget: an induced pulse survives a beat or two
 * of silence in a listener's head and then decays, and an unbounded
 * continuation would draw a confident grid over material the analysis knows
 * nothing about (spec Decision 5's dissent — extrapolation on rubato
 * produces confident-looking nonsense). Four intervals is one bar of common
 * time: enough to read as "the pulse kept going", short enough that it is
 * visibly an ending rather than a new grid. QA tunes it (spec open question
 * 4).
 *
 * It is a count of *beats*, not of seconds — the percept it renders is
 * metrical, so a slow take's ghost reaches further in time (6 s at
 * `RhythmAnalyser`'s 40 BPM floor) and a fast one's less. The second bound
 * below is what keeps that from being the whole rendering.
 */
export const PHANTOM_HORIZON_BEATS = 4;

/**
 * How many of the grid's final intervals the continuation's spacing is
 * taken from — the same span as one of `induceBeatGrid`'s smoothing
 * windows, so the phantom rungs continue at the tempo the last few rendered
 * rungs are already drawn at rather than at some second, independently
 * tuned estimate.
 *
 * It matters that this is *recent* rather than global: on a take that drifts
 * (or simply ends slower than it started), the last interval and the whole
 * take's average are genuinely different tempos. Measured on
 * `test-click-then-continue.wav`, whose tracked beats slow through the
 * non-percussive tail: the local estimate is 0.545 s against a global
 * 60/bpm of 0.501 s — 9 px apart at the default zoom on the first phantom
 * rung, and 35 px by the fourth.
 */
export const LOCAL_INTERVAL_WINDOW_BEATS = 2 * GRID_SMOOTHING_HALF_WINDOW + 1;

/**
 * The phantom continuation of `gridTimes` — grid points past its last one,
 * at its recent local interval, in the same track-buffer-relative seconds
 * (the caller applies `Track.startTime`).
 *
 * Empty without a confident tempo. That gate is `isConfidentTempo`, the same
 * one `selectRhythmAnchor` uses, so "confident enough to render a grid" and
 * "confident enough to continue it past the evidence" can never mean two
 * different things — and the harder claim is the one that must not be made
 * on a weaker estimate.
 */
export function extrapolateTicks(
  gridTimes: number[],
  tempo: TrackTempo | undefined,
): number[] {
  if (!isConfidentTempo(tempo)) return [];
  // One point defines no interval to continue; the grid itself needs three
  // ticks before it exists at all (`MIN_TICKS_FOR_GRID`), so this only
  // guards a caller passing something hand-built.
  if (gridTimes.length < 2) return [];

  const interval = recentInterval(gridTimes);
  // A grid whose final points don't advance has no pulse to continue, and
  // multiplying by a non-positive interval would walk the phantoms backwards
  // *into* the detected grid — the one thing this layer must never overlap.
  if (!(interval > 0)) return [];

  // Never continue further than the evidence being continued: the second
  // bound is the number of intervals actually observed. Without it the
  // horizon is absolute, so the shortest grid that exists at all — three
  // ticks, `MIN_TICKS_FOR_GRID` — would render four guesses against three
  // tracked beats, i.e. mostly ghost, which is the opposite of what a
  // bounded horizon is for (`/code-review` on PR #589). The clamp only ever
  // binds on a grid of five points or fewer, so it costs the ordinary case
  // nothing.
  const horizon = Math.min(PHANTOM_HORIZON_BEATS, gridTimes.length - 1);
  const lastGridTime = gridTimes[gridTimes.length - 1];
  return Array.from(
    { length: horizon },
    (_, beat) => lastGridTime + (beat + 1) * interval,
  );
}

/**
 * Median of the last `LOCAL_INTERVAL_WINDOW_BEATS` grid intervals.
 *
 * Median rather than the final interval alone: the grid's ends carry the
 * clipped-window bias `induceBeatGrid` documents (the tempo is reported ~2
 * beats late there), so the single last interval is the least representative
 * one available. Median rather than mean for the usual reason — one
 * mis-tracked beat at the very end would otherwise set the tempo of
 * everything drawn past it.
 */
function recentInterval(gridTimes: number[]): number {
  const intervals: number[] = [];
  const first = Math.max(1, gridTimes.length - LOCAL_INTERVAL_WINDOW_BEATS);
  for (let i = first; i < gridTimes.length; i++) {
    intervals.push(gridTimes[i] - gridTimes[i - 1]);
  }
  intervals.sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  return intervals.length % 2 === 1
    ? intervals[middle]
    : (intervals[middle - 1] + intervals[middle]) / 2;
}
