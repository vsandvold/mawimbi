/**
 * Screenshot-decoded-pixel helpers (mawimbi#464 pattern, extracted in #480;
 * extended with `meanLuminance` in #489 for spec 004's dimming/tail-energy
 * assertions).
 *
 * Rect-based assertions (`getBoundingClientRect`, `toBeVisible()`) pass
 * straight through clipping and transform bugs — they assert layout, not
 * paint. Decoding an actual screenshot's pixels is the only automated check
 * that catches "renders nothing" while every rect-based invariant stays
 * green (see kb/verification.md, "Screenshot-decoded pixels").
 */
import type { Page } from '@playwright/test';

export type PixelClip = { x: number; y: number; width: number; height: number };

const SATURATION_THRESHOLD = 40;
// Rec. 601 luma weights (ITU-R BT.601 §2.5.1): the standard-definition
// luminance formula, matching what "perceived brightness" means elsewhere
// in this codebase's tooling.
const LUMA_WEIGHT_RED = 0.299;
const LUMA_WEIGHT_GREEN = 0.587;
const LUMA_WEIGHT_BLUE = 0.114;

/**
 * Screenshots `clip` and reports whether any pixel in it is *saturated*
 * (max−min channel difference above threshold). Grayscale chrome (rails,
 * loudness meter, background) never trips this; colored content does —
 * useful whenever "is there colored content here" is the falsifiable claim.
 */
export async function hasSaturatedPixel(
  page: Page,
  clip: PixelClip,
): Promise<boolean> {
  const { data } = await decodeClip(page, clip);
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    if (max - min > SATURATION_THRESHOLD) return true;
  }
  return false;
}

/**
 * Screenshots `clip` and returns the mean perceptual luminance (Rec. 601
 * weights, 0–255) across every pixel in it. Useful for "did this region get
 * dimmer/brighter" claims — e.g. edit-mode background-track dimming (#490)
 * or reverb-tail energy appearing in a previously near-black dry region
 * (#494) — where a single saturation bit isn't enough.
 */
export async function meanLuminance(page: Page, clip: PixelClip): Promise<number> {
  const { data } = await decodeClip(page, clip);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total +=
      LUMA_WEIGHT_RED * data[i] +
      LUMA_WEIGHT_GREEN * data[i + 1] +
      LUMA_WEIGHT_BLUE * data[i + 2];
  }
  return total / (data.length / 4);
}

/**
 * Screenshots `clip` and decodes it to raw RGBA pixel data in the page
 * context, returned as a plain number array (typed arrays don't survive
 * the `page.evaluate` round trip).
 */
async function decodeClip(
  page: Page,
  clip: PixelClip,
): Promise<{ data: number[]; width: number; height: number }> {
  const screenshot = await page.screenshot({ clip });

  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data: Array.from(data), width: canvas.width, height: canvas.height };
  }, screenshot.toString('base64'));
}
