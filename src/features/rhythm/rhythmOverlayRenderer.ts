// rhythmOverlayRenderer — draws both rhythm layers (spec 008 Decision 2).
//
// The *categorical* layer: beat rungs, thin full-width lines across the
// runway at the anchor track's induced beat grid (Goal 2), on the
// project-level `RhythmOverlay` canvas.
//
// The *nuance* layer: onset ticks, short marks at the runway's rail edges
// in the track's own color at each of its onsets (Goal 3), drawn into each
// track's own overlay canvas by `Spectrogram.tsx` so focus lift, edit-mode
// dimming and mute styling apply to them for free. A track's swing or push
// is readable as the spatial offset between its ticks and the rungs — the
// geometry is the annotation, so there is no micro-timing decoration here
// (spec non-goal).
//
// Both live in one module because they share a coordinate convention (see
// `RhythmOverlayViewport`) and because reading them side by side is how one
// checks that a tick and a rung at the same time land on the same row.
//
// Pure draw functions of (times, the track's start time, viewport). The
// placement math is separated from the stroking so it can be asserted
// directly — a mark's Y *is* the feature, and a canvas call-count
// assertion would be the implementation-detail testing kb/verification.md
// warns against.
//
// Every appearance constant lives here so tuning them (spec open questions
// 1 and 4 — layer order, alpha, density) never touches tested logic.

import { type TrackColor } from '../tracks/types';
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

/**
 * How far an onset tick reaches in from each rail. Short enough that a
 * dense mix reads as texture at the edges rather than as content across the
 * runway (full-width per-track lines were the rejected placement, spec
 * Decision 2), long enough to be legible on a phone.
 */
export const ONSET_TICK_LENGTH_PX = 14;

/**
 * Thicker than a rung: a tick is an *event*, and it has a fraction of the
 * rung's width to say so with.
 */
export const ONSET_TICK_THICKNESS_PX = 2.5;

/**
 * Ticks sit above their own track's spectrogram in the track's own color,
 * so they need to read against it while still being marks rather than
 * content. QA tunes this (spec open question 4).
 */
export const ONSET_TICK_OPACITY = 0.9;

/**
 * On-screen spacing below which ticks stop reading as separate events and
 * start reading as one bar down the rail — roughly five times their own
 * thickness. A dense track's onsets run ~5–15 per second (spec Decision
 * 1), which at the zoom floor (`MIN_PIXELS_PER_SECOND` = 50) is 3–10 px
 * apart: the default view reaches this, it is not a hypothetical.
 */
export const MIN_TICK_SPACING_PX = 12;

/**
 * Alpha floor for the density fade. Dense passages stay legible as a
 * texture at the rail rather than vanishing — every onset is still
 * rendered, which is the point of fading rather than thinning.
 */
export const MIN_ONSET_TICK_OPACITY = 0.25;

/**
 * An induced grid, paired with the one derived quantity the renderer needs
 * every frame.
 *
 * `medianInterval` travels *with* the grid rather than being recomputed
 * inside the draw because it is a property of the grid, not of the frame:
 * deriving it per redraw meant a full copy and sort of every beat in the
 * take on each dirty frame — for a 700-beat anchor during playback, a
 * 699-element sort sixty times a second, on the one loop mawimbi#541 exists
 * to keep allocation-free (`/code-review` on PR #585). Build it once with
 * `buildBeatGrid` wherever the grid itself is memoized.
 */
export type BeatGrid = {
  /** Induced grid points, track-buffer relative (`startTime` not applied). */
  times: number[];
  /** Typical spacing between grid points — the level-of-detail input. */
  medianInterval: number;
};

/** An anchorless grid: stable identity, so dirty checks settle on it. */
export const EMPTY_BEAT_GRID: BeatGrid = { times: [], medianInterval: 0 };

/** Pairs induced grid times with their spacing. */
export function buildBeatGrid(times: number[]): BeatGrid {
  return { times, medianInterval: medianGridInterval(times) };
}

/** A mark's placement, in the overlay canvas's own top-down pixel space. */
export type MarkPlacement = {
  /** Project time (seconds) — the track's start time already applied. */
  time: number;
  /** Canvas Y, measured down from the canvas's top edge. */
  y: number;
};

export type RungPlacement = MarkPlacement;
export type OnsetTickPlacement = MarkPlacement;

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

/** Which rungs fall inside the canvas, and where — thinned by the LOD rule. */
export function computeVisibleRungs(
  grid: BeatGrid,
  startTime: number,
  viewport: RhythmOverlayViewport,
): RungPlacement[] {
  const { times, medianInterval } = grid;
  const stride = visibleRungStride(viewport.pixelsPerSecond, medianInterval);
  return placeMarks(times, startTime, viewport, stride);
}

/**
 * Where each of a track's onsets falls on its overlay canvas — the same
 * projection the rungs use, so a tick and a rung at the same moment land on
 * the same row and the offset between them is the micro-timing itself.
 *
 * Every onset is placed: unlike the grid, onsets carry no metrical
 * structure a stride could thin without lying about which events happened.
 * Density is handled by fading instead (`onsetTickOpacity`) — the split the
 * spec's own LOD rule draws between the two layers (Decision 2: "drop to
 * every 2nd/4th rung … fade ticks below a threshold").
 */
export function computeVisibleOnsetTicks(
  onsets: number[],
  startTime: number,
  viewport: RhythmOverlayViewport,
): OnsetTickPlacement[] {
  return placeMarks(onsets, startTime, viewport, 1);
}

/**
 * How strongly to draw ticks that are `spacingPx` apart on screen: full
 * strength while they read as separate marks, fading toward
 * `MIN_ONSET_TICK_OPACITY` as they crowd together.
 *
 * Fading rather than thinning is what keeps the layer honest — a dropped
 * tick is an event the rendering claims did not happen, while a faint one
 * is still there to be read against the rungs. What it buys is that a dense
 * mix's rails read as texture under the pulse instead of a solid bar
 * competing with it (spec open question 4's top QA risk).
 */
export function onsetTickOpacity(spacingPx: number): number {
  // A single visible tick has no spacing to speak of, and a non-finite one
  // means the caller has nothing usable — draw at full strength either way
  // rather than fading to invisible on a degenerate input.
  if (!(spacingPx > 0)) return ONSET_TICK_OPACITY;
  if (spacingPx >= MIN_TICK_SPACING_PX) return ONSET_TICK_OPACITY;
  const crowding = spacingPx / MIN_TICK_SPACING_PX;
  return Math.max(MIN_ONSET_TICK_OPACITY, ONSET_TICK_OPACITY * crowding);
}

/**
 * Projects every `stride`-th time onto the canvas, dropping the ones it
 * can't reach.
 *
 * The `startTime` offset is the #484 class (kb/domain.md): beat ticks and
 * onsets are *track-buffer* relative, like melody note times, so a track
 * recorded as an overdub partway through the timeline has every one of its
 * marks shifted by its own start. Every uploaded track has `startTime: 0`,
 * which is exactly why this is easy to get wrong and invisible until
 * someone overdubs.
 */
function placeMarks(
  times: number[],
  startTime: number,
  viewport: RhythmOverlayViewport,
  stride: number,
): MarkPlacement[] {
  const { timeZeroY, pixelsPerSecond, canvasHeight } = viewport;
  if (times.length === 0) return [];

  const marks: MarkPlacement[] = [];
  for (let i = 0; i < times.length; i += stride) {
    const time = times[i] + startTime;
    const y = timeZeroY - time * pixelsPerSecond;
    // Windowed to the canvas like the spectrogram's own tiles are: drawing
    // outside it costs strokes that can never be seen, and a caller
    // reasoning from "everything above the playhead" would be wrong anyway
    // — the canvas covers the runway's window, not the viewport
    // (kb/verification.md, #494).
    //
    // Written as "keep what is inside" rather than "skip what is outside"
    // because every comparison against `NaN` is false: the negated form
    // lets a non-finite time through as a `NaN` placement, which
    // `fillRect` then silently ignores while still defeating the callers'
    // "nothing to draw" early return on every frame. Only the grid's times
    // are sanitized upstream (`induceBeatGrid`'s `sanitizeTicks`); onsets
    // reach here straight off a worker result or a persisted row
    // (`/code-review` on PR #587).
    if (!(y >= 0 && y <= canvasHeight)) continue;
    marks.push({ time, y });
  }
  return marks;
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
  grid: BeatGrid,
  startTime: number,
  viewport: RhythmOverlayViewport,
): void {
  const rungs = computeVisibleRungs(grid, startTime, viewport);
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

/**
 * Strokes each visible onset as a pair of short marks, one at each rail —
 * both edges rather than one, so a tick's row reads as a row across the
 * runway without a line being drawn through the music (spec Decision 2's
 * rejected placements).
 *
 * Like `drawBeatRungs`, draws nothing at all when there is nothing to draw:
 * a track with no onsets leaves the frame byte-identical to a build without
 * this feature (Goal 7).
 */
export function drawOnsetTicks(
  ctx: CanvasRenderingContext2D,
  onsets: number[],
  startTime: number,
  color: TrackColor,
  viewport: RhythmOverlayViewport,
): void {
  const ticks = computeVisibleOnsetTicks(onsets, startTime, viewport);
  if (ticks.length === 0) return;

  const { canvasWidth, canvasHeight } = viewport;
  const rightX = Math.max(0, canvasWidth - ONSET_TICK_LENGTH_PX);
  // Density measured from what is actually on this canvas, not from a
  // median over the whole take: it is the *visible* crowding that decides
  // legibility, and dividing the window by the mark count gets it in O(1)
  // — no sort, on the one loop mawimbi#541 exists to keep allocation-free
  // (the `BeatGrid.medianInterval` precedent, `/code-review` on PR #585).
  const opacity = onsetTickOpacity(canvasHeight / ticks.length);

  ctx.save();
  ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
  for (const tick of ticks) {
    const y = tick.y - ONSET_TICK_THICKNESS_PX / 2;
    ctx.fillRect(0, y, ONSET_TICK_LENGTH_PX, ONSET_TICK_THICKNESS_PX);
    ctx.fillRect(rightX, y, ONSET_TICK_LENGTH_PX, ONSET_TICK_THICKNESS_PX);
  }
  ctx.restore();
}
