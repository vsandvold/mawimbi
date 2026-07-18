import type { RunwayConfig } from './runwayProjection';

/**
 * Guitar Hero-style note highway — the target look pinned from reference
 * screenshots (see mawimbi#443's decision comment). Values are proportional
 * (fractions of the visible area), not fixed pixels, so the look holds
 * across screen sizes.
 */
export const noteHighway: RunwayConfig = {
  tiltDeg: 70,
  playheadFraction: 0.75,
  playheadWidth: 0.65,
  elevationFraction: 0.55,
  runwayLengthPx: 1800,
  overhangPx: 320,
};

// Full preset set (subtleRamp, flat, etc.) lands in #446; this is the one
// preset #445 needs to wire the projection module into the scrubber.
export const activeRunwayConfig: RunwayConfig = noteHighway;
