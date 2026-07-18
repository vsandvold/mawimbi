export type RunwayConfig = {
  tiltDeg: number;
  playheadFraction: number;
  playheadWidth: number;
  elevationFraction: number;
  runwayLengthPx: number;
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
};

// Below this tilt the plane is treated as flat: rotateX(0) is the identity
// transform, so no perspective/origin math can (or needs to) apply.
const FLAT_TILT_THRESHOLD_DEG = 0.01;

// rotateX approaches an edge-on singularity at 90deg (tan/cot blow up).
// Clamping keeps the solver finite while still reading as "nearly edge-on".
const MAX_TILT_DEG = 89.9;

// Large enough that rotateX(0deg)'s foreshortening is imperceptible, so the
// flat fallback renders identically to a plane with no perspective at all.
const FLAT_PERSPECTIVE_PX = 1_000_000;

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
 */
export function solveGeometry(
  config: RunwayConfig,
  visible: VisibleBox,
): RunwayGeometry {
  const tiltDeg = clampTilt(config.tiltDeg);
  const playheadScreenY = config.playheadFraction * visible.height;

  if (tiltDeg <= FLAT_TILT_THRESHOLD_DEG) {
    return solveFlatGeometry(playheadScreenY, config.runwayLengthPx);
  }

  return solveTiltedGeometry(config, tiltDeg, playheadScreenY, visible.height);
}

function clampTilt(tiltDeg: number): number {
  if (tiltDeg <= 0) return 0;
  return Math.min(tiltDeg, MAX_TILT_DEG);
}

function solveFlatGeometry(
  playheadScreenY: number,
  runwayLengthPx: number,
): RunwayGeometry {
  return {
    perspectivePx: FLAT_PERSPECTIVE_PX,
    perspectiveOriginY: playheadScreenY,
    transformOriginY: playheadScreenY,
    rotateXDeg: 0,
    horizonY: playheadScreenY - FLAT_PERSPECTIVE_PX,
    farEdgeS: runwayLengthPx,
  };
}

function solveTiltedGeometry(
  config: RunwayConfig,
  tiltDeg: number,
  playheadScreenY: number,
  visibleHeight: number,
): RunwayGeometry {
  const tiltRad = degToRad(tiltDeg);
  const { playheadWidth, elevationFraction, runwayLengthPx } = config;
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
    farEdgeS: sPlayhead + runwayLengthPx,
  };
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Scale factor (apparent-width ratio) at plane-space distance `s` from the origin. */
export function widthAtPlane(s: number, geometry: RunwayGeometry): number {
  const tiltRad = degToRad(geometry.rotateXDeg);
  return (
    geometry.perspectivePx / (geometry.perspectivePx + s * Math.sin(tiltRad))
  );
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
  const denominator = p * Math.cos(tiltRad) + (y - yo) * Math.sin(tiltRad);
  return (p * (y0 - y)) / denominator;
}
