export type RunwayConfig = {
  /** Slope of the road, in degrees (CSS rotateX). Higher = flatter road,
   *  stronger compression toward the horizon. Range: 0–85. */
  tiltDeg: number;
  /** Vertical position of the playhead line, as a fraction of visible
   *  height from the top (0 = top, 1 = bottom). */
  playheadFraction: number;
  /** Measured width of the runway at the playhead line, as a fraction of
   *  visible width. Range: 0.4–1.0. */
  playheadWidth: number;
  /** How high the horizon floats above the playhead, as a fraction of
   *  visible height; smaller = camera closer to the ground. */
  elevationFraction: number;
  /** How much upcoming audio is scrollable into view above the playhead,
   *  in pre-transform px. Not tied to where the fog gradient visually
   *  starts — that's controlled independently by `fogStartFraction`
   *  (`RunwayPreset`, runwayConfig.ts) against the solved screen-space
   *  horizon, a different coordinate space from this pre-transform value. */
  runwayLengthPx: number;
  /** Road under your feet — scrollable below the playhead, in
   *  pre-transform px. */
  overhangPx: number;
};

export type VisibleBox = {
  width: number;
  height: number;
};

export type RunwayGeometry = {
  perspectivePx: number;
  perspectiveOriginY: number;
  transformOriginY: number;
  rotateXDeg: number;
  horizonY: number;
  farEdgeS: number;
  nearEdgeS: number;
};

// Below this tilt, geometry switches to a distinct flat mode (rotateX(0),
// no perspective) rather than letting tiltDeg approach 0 through the tilted
// formula below. This is a deliberate mode switch, not a smooth
// approximation boundary — see solveGeometry's doc comment for why the two
// modes don't (and structurally can't) converge, and why this sits well
// above 0 rather than at some tiny epsilon.
const FLAT_TILT_THRESHOLD_DEG = 1;

// rotateX approaches an edge-on singularity at 90deg (tan/cot blow up).
// Clamping keeps the solver finite while still reading as "nearly edge-on".
const MAX_TILT_DEG = 89.9;

// Large enough that rotateX(0deg)'s foreshortening is imperceptible, so the
// flat fallback renders identically to a plane with no perspective at all.
const FLAT_PERSPECTIVE_PX = 1_000_000;

// playheadWidth and elevationFraction are divisors throughout the tilted
// solve; exactly 0 (or pathologically close to it) would produce
// Infinity/NaN geometry. These floors sit far below any sane preset value —
// they exist purely so a misconfigured RunwayConfig fails safe (an extreme
// but finite, renderable geometry) instead of propagating NaN into CSS.
const MIN_PLAYHEAD_WIDTH = 0.01;
const MIN_ELEVATION_FRACTION = 0.01;

// visible.height is a measured DOM size that can be 0 or briefly negative
// (e.g. before the first ResizeObserver callback fires, or if a drawer
// taller than the container is ever configured) — floor it for the same
// fail-safe reason as the two constants above.
const MIN_VISIBLE_HEIGHT_PX = 1;

// Below this magnitude, treat a projection denominator as this magnitude
// instead of the true (near-)zero value, so screenYToPlane/widthAtPlane
// return a large-but-finite number instead of Infinity/NaN at the horizon
// or at the "behind the camera" point where perspectivePx + s·sinθ = 0.
const MIN_DENOMINATOR_MAGNITUDE = 1e-6;

/**
 * Solves the three CSS unknowns (perspective distance, and the shared
 * transform/perspective origin) that satisfy the runway's screen-space
 * anchors: apparent width at the playhead, the playhead's screen position,
 * and the horizon's screen position.
 *
 * The projection model (see mawimbi#443 for the full derivation): a point
 * on the tilted plane at distance `s` above the origin projects to
 *
 *   scale(s)   = p / (p + s·sin θ)
 *   screenY(s) = yo + (y0 − s·cos θ − yo) · scale(s)
 *   horizonY   = yo − p·cot θ   (limit as s → ∞)
 *
 * Setting the perspective-origin and transform-origin to the same point
 * (yo = y0 = Y0) leaves three unknowns — perspective `p`, origin `Y0`, and
 * the playhead's plane-space distance from that origin `sPlayhead` — solved
 * in closed form from the three anchors. No iteration, no fallback
 * heuristics: the same config always yields the same geometry.
 *
 * Below `FLAT_TILT_THRESHOLD_DEG`, geometry comes from `solveFlatGeometry`
 * instead of the formula above. This is a deliberate mode switch, not a
 * numerical approximation: as tiltRad → 0 the tilted formula's own
 * `perspectivePx` → 0 (near-edge-on foreshortening), the opposite extreme
 * from the flat mode's scale-1-everywhere — so there is no continuous
 * handoff to protect between the two. The only caller of the flat mode
 * (`prefers-reduced-motion`) always passes tiltDeg exactly 0, never an
 * intermediate value.
 */
export function solveGeometry(
  config: RunwayConfig,
  visible: VisibleBox,
): RunwayGeometry {
  const tiltDeg = clampTilt(config.tiltDeg);
  const height = Math.max(visible.height, MIN_VISIBLE_HEIGHT_PX);
  const playheadScreenY = config.playheadFraction * height;

  if (tiltDeg <= FLAT_TILT_THRESHOLD_DEG) {
    return solveFlatGeometry(
      playheadScreenY,
      config.runwayLengthPx,
      config.overhangPx,
    );
  }

  return solveTiltedGeometry(config, tiltDeg, playheadScreenY, height);
}

function clampTilt(tiltDeg: number): number {
  // Negative tilt is outside the documented range (0 = flat, 90 = edge-on
  // road) — clamp to the boundary rather than supporting a "mirrored" tilt
  // direction that no preset or design reference calls for.
  if (tiltDeg <= 0) return 0;
  return Math.min(tiltDeg, MAX_TILT_DEG);
}

function solveFlatGeometry(
  playheadScreenY: number,
  runwayLengthPx: number,
  overhangPx: number,
): RunwayGeometry {
  return {
    perspectivePx: FLAT_PERSPECTIVE_PX,
    perspectiveOriginY: playheadScreenY,
    transformOriginY: playheadScreenY,
    rotateXDeg: 0,
    horizonY: playheadScreenY - FLAT_PERSPECTIVE_PX,
    farEdgeS: runwayLengthPx,
    nearEdgeS: -overhangPx,
  };
}

function solveTiltedGeometry(
  config: RunwayConfig,
  tiltDeg: number,
  playheadScreenY: number,
  visibleHeight: number,
): RunwayGeometry {
  const tiltRad = degToRad(tiltDeg);
  const { runwayLengthPx, overhangPx } = config;
  const playheadWidth = Math.max(config.playheadWidth, MIN_PLAYHEAD_WIDTH);
  const elevationFraction = Math.max(
    config.elevationFraction,
    MIN_ELEVATION_FRACTION,
  );
  const elevationPx = elevationFraction * visibleHeight;

  // Closed-form solution of the three anchor equations for p, Y0, sPlayhead
  // (derivation in mawimbi#443's decision comment).
  const perspectivePx = (elevationPx * Math.tan(tiltRad)) / playheadWidth;
  const originY =
    playheadScreenY + (elevationPx * (1 - playheadWidth)) / playheadWidth;
  const sPlayhead =
    (elevationPx * (1 - playheadWidth)) /
    (playheadWidth * playheadWidth * Math.cos(tiltRad));

  const horizonY = originY - perspectivePx / Math.tan(tiltRad);

  return {
    perspectivePx,
    perspectiveOriginY: originY,
    transformOriginY: originY,
    rotateXDeg: tiltDeg,
    horizonY,
    farEdgeS: sPlayhead + Math.max(runwayLengthPx, 0),
    nearEdgeS: sPlayhead - overhangPx,
  };
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Clamps a projection denominator away from zero, preserving its sign. */
function safeDenominator(value: number): number {
  if (Math.abs(value) >= MIN_DENOMINATOR_MAGNITUDE) return value;
  return value < 0 ? -MIN_DENOMINATOR_MAGNITUDE : MIN_DENOMINATOR_MAGNITUDE;
}

/** Scale factor (apparent-width ratio) at plane-space distance `s` from the origin. */
export function widthAtPlane(s: number, geometry: RunwayGeometry): number {
  const tiltRad = degToRad(geometry.rotateXDeg);
  const denominator = safeDenominator(
    geometry.perspectivePx + s * Math.sin(tiltRad),
  );
  return geometry.perspectivePx / denominator;
}

/** Forward projection: plane-space distance `s` → screen Y coordinate. */
export function planeToScreenY(s: number, geometry: RunwayGeometry): number {
  const tiltRad = degToRad(geometry.rotateXDeg);
  const scale = widthAtPlane(s, geometry);
  return (
    geometry.perspectiveOriginY +
    (geometry.transformOriginY -
      s * Math.cos(tiltRad) -
      geometry.perspectiveOriginY) *
      scale
  );
}

/** Inverse projection: screen Y coordinate → plane-space distance `s`. */
export function screenYToPlane(y: number, geometry: RunwayGeometry): number {
  const tiltRad = degToRad(geometry.rotateXDeg);
  const {
    perspectivePx: p,
    transformOriginY: y0,
    perspectiveOriginY: yo,
  } = geometry;
  const denominator = safeDenominator(
    p * Math.cos(tiltRad) + (y - yo) * Math.sin(tiltRad),
  );
  return (p * (y0 - y)) / denominator;
}
