// SPIKE (mawimbi#593) — the String mode parameter table, as data.
//
// Eighteen-plus tunables cannot be swept by editing code and redeploying,
// which is why the tuning overlay is spike scope rather than polish: the
// spike's questions 1–13 are *all* parameter sweeps. Defaults are spec
// 009's parameter table, which took the prototype's values wherever the two
// disagreed (it is the one someone actually swept).

export type StringParamKey =
  | 'noiseFloor'
  | 'tonality'
  | 'pitchStability'
  | 'transientFast'
  | 'transientSlow'
  | 'wobble'
  | 'c'
  | 'travel'
  | 'tauMem'
  | 'rippleDepth'
  | 'anchor'
  | 'nearFloor'
  | 'layerAlpha'
  | 'laneSep'
  | 'glide'
  | 'lock'
  | 'bendScale'
  | 'noteAlpha'
  | 'noteConfidence'
  | 'pulseSize'
  | 'silenceFloor'
  | 'thickness'
  | 'glow'
  | 'points'
  | 'gamma'
  | 'sigma'
  | 'amplitude'
  | 'rho'
  | 'imageCount'
  | 'forcing'
  | 'lightMin'
  | 'lightMax'
  | 'chromaMax'
  | 'lightFromTimbre'
  | 'bandGradient';

export type StringParams = Record<StringParamKey, number>;

export type StringParamSpec = {
  key: StringParamKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Shown instead of the number at this exact value (the prototype's own
   *  slider formatters name the meaningful zeros — `travel = 0` is
   *  *standing*, `laneSep = 0` is *layered*). */
  zeroLabel?: string;
  maxLabel?: string;
};

// Ordered as they are read: the line's own shape first, then colour, then
// the packet/wobble group last — that group is off by default (`wobble`)
// and exists so spec 009 Decision 1 can be switched back on for evaluation
// without a revert.
export const STRING_PARAM_SPECS: readonly StringParamSpec[] = [
  { key: 'amplitude', label: 'Pitch excursion', min: 0, max: 1, step: 0.01 },
  { key: 'noiseFloor', label: 'Noise floor', min: 0, max: 0.5, step: 0.005 },
  { key: 'tonality', label: 'Tonality gate', min: 0, max: 1, step: 0.01 },
  {
    key: 'pitchStability',
    label: 'Pitch stability',
    min: 0.1,
    max: 12,
    step: 0.1,
  },
  {
    key: 'transientFast',
    label: 'Transient — sharp',
    min: 0.005,
    max: 0.3,
    step: 0.005,
  },
  {
    key: 'transientSlow',
    label: 'Transient — slow',
    min: 0.02,
    max: 1.5,
    step: 0.01,
  },
  { key: 'tauMem', label: 'Memory \u03c4', min: 0.1, max: 8, step: 0.05 },
  {
    key: 'travel',
    label: 'Wave travel',
    min: 0,
    max: 1,
    step: 0.01,
    zeroLabel: 'standing',
  },
  {
    key: 'thickness',
    label: 'Ribbon thickness',
    min: 0.3,
    max: 2.2,
    step: 0.05,
  },
  { key: 'layerAlpha', label: 'Layer opacity', min: 0.15, max: 1, step: 0.01 },
  {
    key: 'laneSep',
    label: 'Delaminate',
    min: 0,
    max: 1,
    step: 0.01,
    zeroLabel: 'layered',
    maxLabel: 'lanes',
  },
  { key: 'silenceFloor', label: 'Silence floor', min: 0, max: 0.7, step: 0.01 },
  { key: 'glow', label: 'Glow', min: 0, max: 2, step: 0.05 },
  { key: 'points', label: 'Points N', min: 64, max: 256, step: 8 },

  { key: 'glide', label: 'Contour glide', min: 0, max: 1, step: 0.01 },
  { key: 'lock', label: 'Note lock', min: 0, max: 1, step: 0.01 },
  { key: 'bendScale', label: 'Bend scale', min: 0, max: 4, step: 0.05 },
  { key: 'noteAlpha', label: 'Pulse brightness', min: 0, max: 1, step: 0.01 },
  { key: 'pulseSize', label: 'Pulse size', min: 0.2, max: 4, step: 0.05 },
  {
    key: 'noteConfidence',
    label: 'Pulse confidence',
    min: 0,
    max: 1,
    step: 0.01,
    zeroLabel: 'all',
  },

  { key: 'lightMin', label: 'L min', min: 0, max: 1, step: 0.01 },
  { key: 'lightMax', label: 'L max', min: 0, max: 1, step: 0.01 },
  { key: 'chromaMax', label: 'C max', min: 0, max: 0.37, step: 0.005 },
  {
    key: 'lightFromTimbre',
    label: 'Lightness \u2190 timbre',
    min: 0,
    max: 1,
    step: 1,
    zeroLabel: 'pitch',
    maxLabel: 'timbre',
  },
  {
    key: 'bandGradient',
    label: 'Cross-section',
    min: 0,
    max: 2,
    step: 1,
    zeroLabel: 'off',
    maxLabel: 'chroma',
  },

  // --- Wobble group (spec 009 Decision 1's packet model), off by default ---
  {
    key: 'wobble',
    label: 'Wobble (packets)',
    min: 0,
    max: 1,
    step: 0.01,
    zeroLabel: 'off',
  },
  { key: 'c', label: 'Wave speed c', min: 0.5, max: 8, step: 0.1 },
  { key: 'rippleDepth', label: 'Warble depth', min: 0, max: 1.4, step: 0.01 },
  { key: 'anchor', label: 'Packet end anchor', min: 0.25, max: 3, step: 0.05 },
  {
    key: 'nearFloor',
    label: 'Packet near floor',
    min: 0,
    max: 0.8,
    step: 0.01,
  },
  { key: 'gamma', label: 'Packet decay \u03b3', min: 0.2, max: 4, step: 0.05 },
  {
    key: 'sigma',
    label: 'Packet width \u03c3',
    min: 0.01,
    max: 0.2,
    step: 0.005,
  },
  {
    key: 'rho',
    label: 'Reflection \u03c1',
    min: 0,
    max: 1,
    step: 0.01,
    zeroLabel: 'no images',
  },
  { key: 'imageCount', label: 'Images M_max', min: 0, max: 64, step: 1 },
  { key: 'forcing', label: 'Sustain forcing', min: 0, max: 1.5, step: 0.01 },
];

export const DEFAULT_STRING_PARAMS: StringParams = {
  // --- The line ---
  // Full pitch range spans 80% of the half-height either side of the
  // centre, so the resting line has room to rise and fall without the
  // extremes clipping into the neighbouring ribbons' territory.
  amplitude: 0.8,
  noiseFloor: 0.06,
  // Relaxed to reject genuine noise only: measured through this pass, a
  // click's loud frames read flatness ~0.03 against a steady tone's 0.0065,
  // so flatness cannot separate them (see `ribbonLine.ts`).
  tonality: 0.6,
  // The gate that does separate them: accept a pitch estimate only when it
  // agrees with the previous frame's to within this many semitones. A tone
  // holds; a click's estimate jumps.
  pitchStability: 2,
  // Interpolation time at a maximally sharp transient and at none: a
  // plucked string reaches its pitch in ~25 ms, a swelling pad in ~300 ms.
  transientFast: 0.025,
  transientSlow: 0.3,
  // 3 s of history on screen at `travel = 1` — the ribbon reads as a
  // rolling contour rather than a 0.36 s twitch. Spec 009's Now-scale
  // placement is the open question this reopens (its question 13).
  tauMem: 3,
  travel: 1,
  thickness: 1.0,
  layerAlpha: 0.61,
  // Layered on one centre line, not in lanes — the resting arrangement the
  // owner asked for. `1` still gives the per-track lanes for question 12.
  laneSep: 0,
  silenceFloor: 0.3,
  glow: 0.7,
  points: 160,

  glide: 0.4,
  lock: 0.85,
  bendScale: 1.0,
  noteAlpha: 0.7,
  pulseSize: 1.0,
  // Basic Pitch reports a spray of low-confidence notes on percussive
  // material — a click is broadband, so it reads as several simultaneous
  // pitches. Without a floor every drum track gets a haze of spurious bars
  // over a ribbon that is correctly holding still. Alpha alone is not
  // enough: a dozen faint bars still read as texture.
  noteConfidence: 0.5,

  lightMin: 0.26,
  lightMax: 0.86,
  chromaMax: 0.2,
  // Colour intensity carries spectral content (owner direction). Spec 009
  // open question 11 asked pitch-or-timbre; this answers it timbre, which
  // is also what the prototype defaulted to — and it frees the height
  // channel to be pitch alone.
  lightFromTimbre: 1,
  bandGradient: 0,

  // --- Wobble group, off ---
  // Spec 009 Decision 1's packet model, scaled to nothing. Everything
  // below only matters once this is non-zero.
  wobble: 0,
  c: 2.8,
  rippleDepth: 0.5,
  anchor: 1.0,
  nearFloor: 0.25,
  gamma: 0.83,
  sigma: 0.06,
  rho: 0.55,
  imageCount: 32,
  forcing: 0.35,
};

export function formatParamValue(spec: StringParamSpec, value: number): string {
  if (spec.zeroLabel && value === spec.min) return spec.zeroLabel;
  if (spec.maxLabel && value === spec.max) return spec.maxLabel;
  if (spec.step >= 1) return `${value}`;
  // Enough places to show one step — a 0.005-step knob reading "0.03"
  // cannot be swept, since two adjacent positions print the same number.
  return value.toFixed(spec.step < 0.01 ? 3 : 2);
}
