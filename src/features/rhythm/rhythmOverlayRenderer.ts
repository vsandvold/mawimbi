// rhythmOverlayRenderer — draws the beat rungs: thin full-width lines
// across the runway at the anchor track's induced beat grid (spec 008
// Goal 2, Decision 2).
//
// Pure draw functions of (grid times, the anchor's start time, viewport).
// The placement math is separated from the stroking so it can be asserted
// directly — a rung's Y *is* the feature, and a canvas call-count
// assertion would be the implementation-detail testing kb/verification.md
// warns against.
//
// Every appearance constant lives here so tuning them (spec open questions
// 1 and 4 — layer order, alpha, density) never touches tested logic.

import { medianGridInterval } from './induceBeatGrid';

/**
 * Runway-accent white rather than `--foreground`, matching
 * `loudnessMeterRenderer.ts`'s `BORDER_COLOR`: the foreground token is
 * near-black in the light theme, which would invert the rungs from a faint
 * glow into dark bars across the runway.
 */
export const RUNG_COLOR = 'rgba(255, 255, 255, 0.32)';

/**
 * Rungs are the grid a listener aligns events *to*, not events themselves
 * — they have to read as a floor marking under the music rather than as
 * content. Thin, and only just visible.
 */
export const RUNG_THICKNESS_PX = 1.5;

/**
 * Below this on-screen spacing, rungs stop reading as a pulse and start
 * reading as texture — the level-of-detail rule drops to every 2nd or 4th
 * grid point rather than letting them merge. At the zoom range's floor
 * (`MIN_PIXELS_PER_SECOND` = 50) a 120 BPM grid is 25 px apart, so this is
 * a case the default view reaches, not a hypothetical.
 */
export const MIN_RUNG_SPACING_PX = 40;

/** A rung's placement, in the overlay canvas's own top-down pixel space. */
export type RungPlacement = {
  /** Project time (seconds) — the anchor's start time already applied. */
  time: number;
  /** Canvas Y, measured down from the canvas's top edge. */
  y: number;
};

export type RhythmOverlayViewport = {
  /**
   * Canvas Y of project time 0. Content at project time `t` sits at
   * `timeZeroY − t × pixelsPerSecond`: later times are *higher* on screen,
   * since the runway recedes upward as the audio plays.
   */
  timeZeroY: number;
  pixelsPerSecond: number;
  canvasWidth: number;
  canvasHeight: number;
};

/**
 * Which rungs fall inside the canvas, and where.
 *
 * The `startTime` offset is the #484 class (kb/domain.md): beat ticks are
 * *track-buffer* relative, like melody note times, so an anchor recorded as
 * an overdub partway through the timeline has every one of its grid points
 * shifted by its own start. Every uploaded track has `startTime: 0`, which
 * is exactly why this is easy to get wrong and invisible until someone
 * overdubs.
 */
export function computeVisibleRungs(
  gridTimes: number[],
  startTime: number,
  viewport: RhythmOverlayViewport,
): RungPlacement[] {
  const { timeZeroY, pixelsPerSecond, canvasHeight } = viewport;
  if (gridTimes.length === 0) return [];

  const stride = visibleRungStride(
    pixelsPerSecond,
    medianGridInterval(gridTimes),
  );

  const rungs: RungPlacement[] = [];
  for (let i = 0; i < gridTimes.length; i += stride) {
    const time = gridTimes[i] + startTime;
    const y = timeZeroY - time * pixelsPerSecond;
    // Windowed to the canvas like the spectrogram's own tiles are: drawing
    // outside it costs strokes that can never be seen, and a caller
    // reasoning from "everything above the playhead" would be wrong anyway
    // — the canvas covers the runway's window, not the viewport
    // (kb/verification.md, #494).
    if (y < 0 || y > canvasHeight) continue;
    rungs.push({ time, y });
  }
  return rungs;
}

/**
 * How many grid points to skip between drawn rungs, given the zoom and the
 * grid's own spacing. Powers of two only: halving the visible density
 * preserves the pulse's own metrical relationships (every 2nd beat, every
 * 4th), where dropping to every 3rd would render a triple meter the music
 * may not have.
 */
export function visibleRungStride(
  pixelsPerSecond: number,
  medianIntervalSeconds: number,
): 1 | 2 | 4 {
  const spacingPx = medianIntervalSeconds * pixelsPerSecond;
  // A non-positive or non-finite spacing means there is no usable grid to
  // thin out; the caller draws whatever it has rather than nothing.
  if (!(spacingPx > 0)) return 1;
  if (spacingPx >= MIN_RUNG_SPACING_PX) return 1;
  if (spacingPx * 2 >= MIN_RUNG_SPACING_PX) return 2;
  return 4;
}

/**
 * Strokes the visible rungs. Draws nothing at all — not even a clear —
 * when there is no grid: the overlay canvas's own clearing is the caller's
 * job, so "no anchor" costs exactly one no-op call and leaves the frame
 * byte-identical to a build without this feature (spec Goal 2's honest
 * degradation, Goal 7's no-data invariance).
 */
export function drawBeatRungs(
  ctx: CanvasRenderingContext2D,
  gridTimes: number[],
  startTime: number,
  viewport: RhythmOverlayViewport,
): void {
  const rungs = computeVisibleRungs(gridTimes, startTime, viewport);
  if (rungs.length === 0) return;

  ctx.save();
  ctx.fillStyle = RUNG_COLOR;
  for (const rung of rungs) {
    ctx.fillRect(
      0,
      rung.y - RUNG_THICKNESS_PX / 2,
      viewport.canvasWidth,
      RUNG_THICKNESS_PX,
    );
  }
  ctx.restore();
}
