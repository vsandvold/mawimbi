import { describe, expect, it } from 'vitest';
import { COLOR_PALETTE } from '../../project/projectPageReducer';
import {
  clampChroma,
  isInGamut,
  maxChromaCached,
  maxChromaFor,
  oklchToRgb,
  rgbToOklch,
} from '../oklch';

/** sRGB round-trip tolerance, in 0–255 channel units. */
const CHANNEL_TOLERANCE = 1;

describe('oklch', () => {
  it('round-trips every palette entry through OKLCH within tolerance', () => {
    for (const colour of COLOR_PALETTE) {
      const back = oklchToRgb(rgbToOklch(colour));
      expect(Math.abs(back.r - colour.r)).toBeLessThanOrEqual(
        CHANNEL_TOLERANCE,
      );
      expect(Math.abs(back.g - colour.g)).toBeLessThanOrEqual(
        CHANNEL_TOLERANCE,
      );
      expect(Math.abs(back.b - colour.b)).toBeLessThanOrEqual(
        CHANNEL_TOLERANCE,
      );
    }
  });

  it('round-trips the extremes', () => {
    expect(oklchToRgb(rgbToOklch({ r: 0, g: 0, b: 0 }))).toEqual({
      r: 0,
      g: 0,
      b: 0,
    });
    expect(oklchToRgb(rgbToOklch({ r: 255, g: 255, b: 255 }))).toEqual({
      r: 255,
      g: 255,
      b: 255,
    });
  });

  // The gamut clamp is per hue for a reason: the achievable maximum
  // differs by hue, so a single global `C_max` silently clips on some hues
  // and not others — and chroma carries loudness, so it would clip exactly
  // where the loudness channel matters most (spec 009, channel allocation).
  it('clamps chroma inside the gamut for every palette hue', () => {
    for (const colour of COLOR_PALETTE) {
      const { h } = rgbToOklch(colour);
      for (const l of [0.26, 0.4, 0.6, 0.86]) {
        const clamped = clampChroma({ l, c: 0.37, h });
        expect(isInGamut(clamped)).toBe(true);
        expect(clamped.c).toBeLessThanOrEqual(0.37);
      }
    }
  });

  it('leaves an already-in-gamut chroma untouched', () => {
    const { h } = rgbToOklch(COLOR_PALETTE[0]);
    const clamped = clampChroma({ l: 0.6, c: 0.01, h });
    expect(clamped.c).toBeCloseTo(0.01, 10);
  });

  // Falsifies "one global C_max would do": if every hue reached the same
  // maximum, the per-hue search would be dead code.
  it('finds different maxima for different hues', () => {
    const maxima = COLOR_PALETTE.map((colour) =>
      maxChromaFor(0.6, rgbToOklch(colour).h),
    );
    const spread = Math.max(...maxima) - Math.min(...maxima);
    expect(spread).toBeGreaterThan(0.01);
  });

  it('memoizes the gamut search on its quantized grid', () => {
    const { h } = rgbToOklch(COLOR_PALETTE[2]);
    // The memo quantizes to 32 lightness buckets and 1° of hue.
    const gridValue = maxChromaFor(Math.round(0.6 * 32) / 32, Math.round(h));
    expect(maxChromaCached(0.6, h)).toBeCloseTo(gridValue, 9);
    // Second call is the memo hit — must agree with the first.
    expect(maxChromaCached(0.6, h)).toBeCloseTo(gridValue, 9);
  });
});
