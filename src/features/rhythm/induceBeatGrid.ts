// induceBeatGrid — turns detected beat ticks into the *induced* grid the
// rungs actually render (spec 008 Decision 2, owner amendment).
//
// Detected ticks are input, never the rendering. Echoic memory supports the
// formation of a *regular* beat: a listener categorizes events into a
// conceptual pulse and mentally aligns the nuanced actual events to that
// imaginary grid. Rendering raw ticks would draw the played micro-timing
// (and the tracker's own jitter) as if it were the grid, which makes two
// things impossible: reading any track's push/drag against the pulse, and
// telling real rhythm apart from detection noise.
//
// So the grid is *locally* isochronous rather than globally: steady input
// produces exactly even spacing, jittered input produces even spacing with
// the jitter absorbed, and a genuine tempo change moves the spacing
// smoothly with it. Nothing here is persisted — it is a pure function of
// the persisted ticks, recomputed on load and on anchor change, so tuning
// these constants never touches stored data or triggers re-analysis.

/**
 * Half-width, in beats, of the window every smoothing pass uses — so each
 * estimate covers up to `2 × this + 1` beats.
 *
 * This is the responsiveness knob (spec open question 6): larger absorbs
 * more per-beat jitter and follows a real tempo change more slowly. Four
 * beats — roughly a bar of common time either side — is long enough that a
 * single mis-tracked beat cannot move the grid (a median needs more than
 * half the window corrupted to shift), and short enough that the grid still
 * tracks an accelerando's per-beat drift. Human QA on real music owns the
 * final number.
 */
export const GRID_SMOOTHING_HALF_WINDOW = 4;

/**
 * Fewer ticks than this and there is no pulse to induce — two ticks define
 * a single interval with nothing to smooth it against, which is a
 * coincidence rather than a beat. Callers get an empty grid, which renders
 * as nothing (spec Goal 2's honest degradation).
 */
export const MIN_TICKS_FOR_GRID = 3;

/**
 * The induced beat grid for `ticks` (seconds, ascending, track-buffer
 * relative — the caller applies `Track.startTime`). One grid point per
 * detected tick; empty when there is no pulse to induce.
 */
export function induceBeatGrid(ticks: number[]): number[] {
  const beats = sanitizeTicks(ticks);
  if (beats.length < MIN_TICKS_FOR_GRID) return [];

  const intervals = computeIntervals(beats);
  const localIntervals = smoothSeries(intervals);

  // Model times: the isochronous-per-local-estimate grid, up to a phase.
  // Integrating the smoothed intervals is what makes spacing follow a real
  // tempo change instead of snapping to one global BPM.
  const modelTimes = [0];
  for (let i = 0; i < localIntervals.length; i++) {
    modelTimes.push(modelTimes[i] + localIntervals[i]);
  }

  // Phase: the model is only defined up to an offset, and integrating an
  // estimate accumulates error over a long take. Smoothing the residual
  // (rather than taking one global offset) re-anchors the phase *locally*,
  // so the grid can neither drift away from the played beats nor inherit
  // any single beat's jitter — the residual of a jittered tick sequence is
  // that jitter, and a median rejects it.
  //
  // Two passes, because one isn't enough: a median over 9 jittered beats
  // still varies by several milliseconds between neighbouring positions,
  // and *that* variation lands directly in the grid's spacing (each grid
  // interval is a local interval plus the change in phase across it) —
  // measurably non-isochronous on the ±30 ms jitter case. The averaging
  // pass leaves a constant phase exactly constant, so the steady case
  // stays exact.
  const residuals = beats.map((tick, i) => tick - modelTimes[i]);
  const phases = smoothSeries(residuals);

  return modelTimes.map((modelTime, i) => modelTime + phases[i]);
}

/**
 * The grid's typical spacing — the density input to the renderer's
 * level-of-detail rule. Median rather than mean so an accelerando's ends
 * don't drag it, and so a single outlier interval can't.
 */
export function medianGridInterval(gridTimes: number[]): number {
  if (gridTimes.length < 2) return 0;
  return median(computeIntervals(gridTimes));
}

/**
 * Drops anything that isn't a usable beat time: non-finite values, and
 * ticks that don't advance (a duplicate or out-of-order tick would produce
 * a zero or negative interval, which integrates into a grid that stalls or
 * runs backwards). essentia returns ascending finite ticks, so this is a
 * guard against a corrupt persisted row rather than an expected case.
 */
function sanitizeTicks(ticks: number[]): number[] {
  const clean: number[] = [];
  for (const tick of ticks) {
    if (!Number.isFinite(tick)) continue;
    if (clean.length > 0 && tick <= clean[clean.length - 1]) continue;
    clean.push(tick);
  }
  return clean;
}

function computeIntervals(times: number[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < times.length; i++) {
    intervals.push(times[i] - times[i - 1]);
  }
  return intervals;
}

/**
 * Median then mean, each over the same clipped window — the estimator both
 * passes use.
 *
 * The median rejects outliers (one badly-tracked beat would perturb a mean
 * at every position in its window; a median ignores it entirely unless it
 * has company) but is itself noisy: over ±30 ms of per-beat jitter,
 * neighbouring medians still differ by several milliseconds. That
 * difference is not cosmetic here — a grid interval is a local interval
 * plus the change in phase across it, so *both* series' position-to-
 * position noise lands directly in the rendered spacing. Averaging the
 * medians collapses it, and leaves an already-constant series exactly
 * constant, so a steady pulse stays isochronous to arithmetic precision.
 */
function smoothSeries(values: number[]): number[] {
  return windowed(windowed(values, median), mean);
}

/**
 * Applies `estimate` over a window centred on each position and clipped at
 * the series' ends.
 *
 * Clipping biases the ends of a *moving* tempo: at the first position the
 * window covers beats 0–4, so it reports the tempo two beats later than
 * the beat being estimated — measured at 20 ms on the accelerando fixture
 * (100→140 BPM, so ~5.5 ms of real drift per beat), decaying to nothing by
 * the fifth beat. That is the accepted cost. The two alternatives are both
 * worse, and for the same underlying reason — they trade a bounded,
 * predictable bias for unbounded noise amplification at exactly the
 * positions with the least data. Shrinking the window symmetrically is
 * unbiased but collapses to a single sample at the very ends, letting the
 * first and last beats' jitter through untouched (measured: a 24 ms swing
 * in grid spacing on the ±30 ms jitter case, against 17 ms of total spread
 * when clipped). Extrapolating the interior trend outward is unbiased on a
 * genuine ramp but reads noise as trend on a steady pulse, inventing an
 * accelerando that isn't there (measured: the first four intervals ramping
 * 523→510 ms on a fixture that is exactly 500 ms throughout).
 */
function windowed(
  values: number[],
  estimate: (window: number[]) => number,
): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - GRID_SMOOTHING_HALF_WINDOW);
    const end = Math.min(values.length, i + GRID_SMOOTHING_HALF_WINDOW + 1);
    return estimate(values.slice(start, end));
  });
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
