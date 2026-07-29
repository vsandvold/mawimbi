// SPIKE (mawimbi#593) — OKLCH colour for the String mode ribbon.
//
// Why OKLCH and not HSL (spec 009, "Why OKLCH and not HSL"): lightness
// carries pitch here, and at fixed HSL lightness the *perceived* lightness
// swings enormously with hue — so the same note would read as a different
// pitch on a differently-coloured track and the redundant pitch encoding
// would fight itself. OKLab's L is perceptually uniform by construction.
//
// Conversions follow Björn Ottosson's published OKLab matrices.

export type Rgb = { r: number; g: number; b: number };
export type Oklch = { l: number; c: number; h: number };

/**
 * Highest chroma any sRGB colour reaches in OKLCH — used only to bound the
 * gamut search, never as a clamp on its own (the achievable maximum varies
 * by hue, which is the entire point of `maxChromaFor`).
 */
const CHROMA_SEARCH_CEILING = 0.4;

/** Bisection steps for the per-hue gamut search: 0.4 / 2^20 ≈ 4e-7. */
const GAMUT_SEARCH_STEPS = 20;

/**
 * Tolerance on the in-gamut test. sRGB round-trips accumulate ~1e-7 of
 * float error through two cube roots and two matrices; without a tolerance
 * the search rejects colours that are exactly on the boundary.
 */
const GAMUT_EPSILON = 1e-6;

// --- sRGB transfer function ---

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308
    ? 12.92 * value
    : 1.055 * value ** (1 / 2.4) - 0.055;
}

// --- OKLab ---

type Oklab = { l: number; a: number; b: number };
type LinearRgb = { r: number; g: number; b: number };

function linearRgbToOklab({ r, g, b }: LinearRgb): Oklab {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToLinearRgb({ l, a, b }: Oklab): LinearRgb {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const lc = l_ * l_ * l_;
  const mc = m_ * m_ * m_;
  const sc = s_ * s_ * s_;

  return {
    r: 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    g: -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    b: -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  };
}

// --- Public API ---

/** Converts an 0–255 sRGB triple (the shape `TrackColor` uses) to OKLCH. */
export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lab = linearRgbToOklab({
    r: srgbToLinear(r / 255),
    g: srgbToLinear(g / 255),
    b: srgbToLinear(b / 255),
  });
  const chroma = Math.hypot(lab.a, lab.b);
  // Hue is meaningless at zero chroma; report 0 rather than an atan2 of
  // two denormals, so a grey round-trips to a stable value.
  const hue = chroma < 1e-9 ? 0 : (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return { l: lab.l, c: chroma, h: (hue + 360) % 360 };
}

/**
 * Converts OKLCH to an 0–255 sRGB triple, clipping each channel. Callers
 * that care about hue fidelity must clamp chroma with `clampChroma` first —
 * per-channel clipping shifts hue at high chroma, which is exactly the
 * defect noted in the prototype's own `enc()` (spec 009 parameter table).
 */
export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180;
  const linear = oklabToLinearRgb({
    l,
    a: c * Math.cos(radians),
    b: c * Math.sin(radians),
  });
  return {
    r: encodeChannel(linear.r),
    g: encodeChannel(linear.g),
    b: encodeChannel(linear.b),
  };
}

function encodeChannel(linear: number): number {
  const encoded = linearToSrgb(linear);
  // A non-finite input would otherwise emit `rgb(NaN, …)`, which canvas
  // rejects by *throwing* from `addColorStop`/`fillStyle` rather than
  // ignoring — one bad sample would take down the whole frame.
  if (!Number.isFinite(encoded)) return 0;
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
}

/** Whether an OKLCH colour lands inside sRGB without any channel clipping. */
export function isInGamut({ l, c, h }: Oklch): boolean {
  const radians = (h * Math.PI) / 180;
  const { r, g, b } = oklabToLinearRgb({
    l,
    a: c * Math.cos(radians),
    b: c * Math.sin(radians),
  });
  return (
    r >= -GAMUT_EPSILON &&
    r <= 1 + GAMUT_EPSILON &&
    g >= -GAMUT_EPSILON &&
    g <= 1 + GAMUT_EPSILON &&
    b >= -GAMUT_EPSILON &&
    b <= 1 + GAMUT_EPSILON
  );
}

/**
 * Highest chroma that stays inside sRGB at this lightness and hue.
 *
 * This is the per-hue clamp spec 009 requires: the achievable maximum
 * differs by hue, so a single global `C_max` silently clips on some hues
 * and not others — and chroma carries loudness, so it would clip exactly
 * where the loudness channel matters most.
 */
export function maxChromaFor(l: number, h: number): number {
  if (!isInGamut({ l, c: 0, h })) return 0;
  let low = 0;
  let high = CHROMA_SEARCH_CEILING;
  for (let i = 0; i < GAMUT_SEARCH_STEPS; i++) {
    const mid = (low + high) / 2;
    if (isInGamut({ l, c: mid, h })) low = mid;
    else high = mid;
  }
  return low;
}

/** Clamps `c` to the gamut boundary for this lightness and hue. */
export function clampChroma({ l, c, h }: Oklch): Oklch {
  return { l, c: Math.min(c, maxChromaFor(l, h)), h };
}

/** Gamut-clamped OKLCH → a `rgba(...)` string ready for a canvas fill. */
export function oklchToCss(colour: Oklch, alpha = 1): string {
  const { r, g, b } = oklchToRgb({
    ...colour,
    c: Math.min(colour.c, maxChromaCached(colour.l, colour.h)),
  });
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Quantization of the memo grid — 32 lightness × 1° hue buckets. */
const CHROMA_MEMO_LIGHTNESS_STEPS = 32;

const chromaMemo = new Map<number, number>();

/**
 * `maxChromaFor` memoized on a coarse (L, hue) grid.
 *
 * The bisection is 20 in-gamut tests, and the renderer asks for one per
 * gradient stop per ribbon per frame — several thousand matrix evaluations
 * a frame if computed live. Hue is constant per track and lightness moves
 * smoothly, so a quantized grid collapses that to a handful of misses in
 * the first second and pure map lookups thereafter.
 */
export function maxChromaCached(l: number, h: number): number {
  const lightnessBucket = Math.round(
    Math.min(1, Math.max(0, l)) * CHROMA_MEMO_LIGHTNESS_STEPS,
  );
  const hueBucket = Math.round(((h % 360) + 360) % 360);
  const key = hueBucket * (CHROMA_MEMO_LIGHTNESS_STEPS + 1) + lightnessBucket;
  const cached = chromaMemo.get(key);
  if (cached !== undefined) return cached;
  const value = maxChromaFor(
    lightnessBucket / CHROMA_MEMO_LIGHTNESS_STEPS,
    hueBucket,
  );
  chromaMemo.set(key, value);
  return value;
}
