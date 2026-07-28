// SPIKE (mawimbi#593) — the String mode parameter table, as data.
//
// Eighteen-plus tunables cannot be swept by editing code and redeploying,
// which is why the tuning overlay is spike scope rather than polish: the
// spike's questions 1–13 are *all* parameter sweeps. Defaults are spec
// 009's parameter table, which took the prototype's values wherever the two
// disagreed (it is the one someone actually swept).

export type StringParamKey =
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

export const STRING_PARAM_SPECS: readonly StringParamSpec[] = [
  { key: 'c', label: 'Wave speed c', min: 0.5, max: 8, step: 0.1 },
  {
    key: 'travel',
    label: 'Wave travel',
    min: 0,
    max: 1,
    step: 0.01,
    zeroLabel: 'standing',
  },
  { key: 'tauMem', label: 'Memory τ', min: 0.1, max: 4, step: 0.05 },
  { key: 'rippleDepth', label: 'Warble depth', min: 0, max: 1.4, step: 0.01 },
  { key: 'anchor', label: 'End anchor', min: 0.25, max: 3, step: 0.05 },
  { key: 'nearFloor', label: 'Near-end floor', min: 0, max: 0.8, step: 0.01 },
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
  { key: 'glide', label: 'Contour glide', min: 0, max: 1, step: 0.01 },
  { key: 'lock', label: 'Note lock', min: 0, max: 1, step: 0.01 },
  { key: 'bendScale', label: 'Bend scale', min: 0, max: 4, step: 0.05 },
  { key: 'noteAlpha', label: 'Note bar alpha', min: 0, max: 1, step: 0.01 },
  { key: 'silenceFloor', label: 'Silence floor', min: 0, max: 0.7, step: 0.01 },
  {
    key: 'thickness',
    label: 'Ribbon thickness',
    min: 0.3,
    max: 2.2,
    step: 0.05,
  },
  { key: 'glow', label: 'Glow', min: 0, max: 2, step: 0.05 },
  { key: 'points', label: 'Points N', min: 64, max: 256, step: 8 },
  { key: 'gamma', label: 'Packet decay γ', min: 0.2, max: 4, step: 0.05 },
  { key: 'sigma', label: 'Packet width σ', min: 0.01, max: 0.2, step: 0.005 },
  { key: 'amplitude', label: 'Excursion A_max', min: 0, max: 1, step: 0.01 },
  {
    key: 'rho',
    label: 'Reflection ρ',
    min: 0,
    max: 1,
    step: 0.01,
    zeroLabel: 'no images',
  },
  { key: 'imageCount', label: 'Images M_max', min: 0, max: 64, step: 1 },
  { key: 'forcing', label: 'Sustain forcing', min: 0, max: 1.5, step: 0.01 },
  { key: 'lightMin', label: 'L min', min: 0, max: 1, step: 0.01 },
  { key: 'lightMax', label: 'L max', min: 0, max: 1, step: 0.01 },
  { key: 'chromaMax', label: 'C max', min: 0, max: 0.37, step: 0.005 },
  {
    key: 'lightFromTimbre',
    label: 'Lightness ← timbre',
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
];

export const DEFAULT_STRING_PARAMS: StringParams = {
  c: 2.8,
  travel: 0.3,
  tauMem: 1.2,
  rippleDepth: 0.5,
  anchor: 1.0,
  // The asymmetric half of the envelope. `u = 0` is *now* and `u = 1` is
  // τ ago, so pinning both ends identically is a category error on a time
  // axis — a symmetric `sin(πu)^p` multiplies the freshest audio by zero,
  // in the view whose whole justification is making the just-heard legible
  // (spec 009 Decision 1, [PROTO]). 0.25 matches the prototype's own
  // thickness floor at the anchors.
  nearFloor: 0.25,
  layerAlpha: 0.61,
  laneSep: 0.5,
  glide: 0.4,
  lock: 0.85,
  bendScale: 1.0,
  noteAlpha: 0.45,
  silenceFloor: 0.3,
  thickness: 1.0,
  glow: 0.7,
  points: 160,
  gamma: 0.83,
  sigma: 0.06,
  amplitude: 0.42,
  rho: 0.55,
  imageCount: 32,
  forcing: 0.35,
  lightMin: 0.26,
  lightMax: 0.86,
  chromaMax: 0.2,
  // Open question 11: the spec resolved pitch/brightness by substitution;
  // the prototype ships a global toggle and defaults to timbre. Exposed,
  // not hardcoded — answering it is one of the spike's deliverables.
  lightFromTimbre: 0,
  // Open question 10: 0 off, 1 lightness gradient, 2 chroma gradient.
  bandGradient: 1,
};

export function formatParamValue(spec: StringParamSpec, value: number): string {
  if (spec.zeroLabel && value === spec.min) return spec.zeroLabel;
  if (spec.maxLabel && value === spec.max) return spec.maxLabel;
  return spec.step >= 1 ? `${value}` : value.toFixed(2);
}
