import type { RunwayConfig } from './runwayProjection';

export type RunwayPreset = RunwayConfig;

/**
 * Guitar Hero-style note highway — the target look pinned from reference
 * screenshots (see mawimbi#443's decision comment). Values are proportional
 * (fractions of the visible area), not fixed pixels, so the look holds
 * across screen sizes.
 */
export const noteHighway: RunwayPreset = {
  tiltDeg: 70,
  playheadFraction: 0.75,
  playheadWidth: 0.65,
  elevationFraction: 0.55,
  runwayLengthPx: 1800,
  overhangPx: 320,
};

/**
 * Beat Saber-style full-bleed track — wider at the playhead and a lower
 * horizon than noteHighway, so the near edge fills the visible width.
 */
export const beatSaber: RunwayPreset = {
  ...noteHighway,
  playheadWidth: 0.85,
  elevationFraction: 0.35,
};

/**
 * Shallow ramp, matching the subtler #402-era tilt before the runway
 * effect was pushed toward the steeper note-highway look.
 */
export const subtleRamp: RunwayPreset = {
  tiltDeg: 30,
  playheadFraction: 0.6,
  playheadWidth: 0.9,
  elevationFraction: 0.2,
  runwayLengthPx: 1200,
  overhangPx: 150,
};

/**
 * Identity geometry — no tilt, no perspective. Documents what "flat" looks
 * like as a preset; `prefers-reduced-motion` does not switch to this fixed
 * preset, since that would ignore whichever preset (or dev tuning overlay
 * override, #447) is actually active. It instead derives its own flattened
 * variant of that active config (see `useScrubberGeometry`'s
 * `getFlatVariant`), so reduced motion stays correct regardless of what's
 * currently selected.
 */
export const flat: RunwayPreset = {
  tiltDeg: 0,
  playheadFraction: 0.75,
  playheadWidth: 1,
  elevationFraction: 0.55,
  runwayLengthPx: 1800,
  overhangPx: 320,
};

export const RUNWAY_PRESETS = {
  noteHighway,
  beatSaber,
  subtleRamp,
  flat,
} as const;

export const activeRunwayConfig: RunwayPreset = RUNWAY_PRESETS.noteHighway;
