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
export type DecodedPixels = { data: number[]; width: number; height: number };

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
 * Screenshots `clip` and checks whether any pixel's red channel dominates
 * both green and blue by at least `minChannelGap` — a hue check for a
 * specific warm/red-orange accent color, distinct from a generic saturation
 * check (`hasSaturatedPixel`). Needed when the region can also show a
 * *different* saturated color from elsewhere in the UI that a plain
 * saturation check can't tell apart from the accent color — e.g. a track's
 * own spectrogram color bleeding through the loudness meter's translucent
 * background, which would otherwise register as a false positive for the
 * meter's sparkle-burst color (mawimbi#484). Channel *differences* stay
 * roughly proportional under alpha blending against a neutral background,
 * so this still works when the accent color renders at partial opacity.
 */
export async function hasWarmAccentPixel(
  page: Page,
  clip: PixelClip,
  minChannelGap = 40,
): Promise<boolean> {
  return hasWarmAccentPixelInColumns(
    await decodeClip(page, clip),
    0,
    clip.width,
    minChannelGap,
  );
}

/**
 * Same hue check as `hasWarmAccentPixel`, but scans only columns `[xStart,
 * xEnd)` of an already-decoded image. Lets a caller decode one screenshot
 * covering multiple regions of interest and compare them against each other
 * at a single instant — comparing two *separately*-screenshotted regions
 * risks each capturing a different real-world moment (e.g. either side of a
 * short-lived effect's decay window), which can't happen when both
 * predicates run over the same decode (mawimbi#484).
 */
export function hasWarmAccentPixelInColumns(
  decoded: DecodedPixels,
  xStart: number,
  xEnd: number,
  minChannelGap = 40,
): boolean {
  const { data, width, height } = decoded;
  const columnStart = Math.max(0, Math.floor(xStart));
  const columnEnd = Math.min(width, Math.ceil(xEnd));

  for (let y = 0; y < height; y++) {
    for (let x = columnStart; x < columnEnd; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r - b > minChannelGap && r - g > minChannelGap) return true;
    }
  }
  return false;
}

// Default luminance departure (0-255 scale) that counts a pixel as
// "painted" for the row-scan helper below — matches `hasWarmAccentPixel`'s
// default channel-gap threshold in magnitude, chosen for the same reason:
// generous enough to survive alpha-blended rendering, tight enough that a
// neutral background never trips it.
const LINE_LUMINANCE_DELTA = 20;
// A "full-width" line (spec 008's beat rungs) doesn't need every column
// painted — anti-aliasing and rail overlays can interrupt a few columns —
// but a sparse row of scattered pixels isn't a line.
const LINE_MIN_WIDTH_FRACTION = 0.8;

/**
 * Screenshots `clip` and checks whether it contains a horizontal line at
 * (or within `tolerancePx` of) row `y` — the transpose of
 * `hasWarmAccentPixelInColumns`' column scan, for "is there a full-width
 * line at Y" claims (e.g. spec 008's beat rungs) rather than "is there
 * colored content in this column range". A row counts as a line when at
 * least `minWidthFraction` of its columns have luminance departing from
 * `backgroundLuminance` by more than `minLuminanceDelta` — hue-agnostic,
 * since a rung's exact color is a renderer constant not yet decided (spec
 * 008 open question 1).
 */
export async function hasHorizontalLineAtY(
  page: Page,
  clip: PixelClip,
  y: number,
  backgroundLuminance: number,
  options: {
    tolerancePx?: number;
    minLuminanceDelta?: number;
    minWidthFraction?: number;
  } = {},
): Promise<boolean> {
  const decoded = await decodeClip(page, clip);
  return hasHorizontalLineAtRow(decoded, y - clip.y, backgroundLuminance, options);
}

/**
 * Same check as `hasHorizontalLineAtY`, but scans an already-decoded image
 * at row `y` (relative to the decoded image's own top edge) — lets a
 * caller decode one screenshot and check multiple candidate rows against
 * it, the same one-decode-many-checks pattern `hasWarmAccentPixelInColumns`
 * follows for columns (mawimbi#484: two separately-screenshotted regions
 * can capture different real-world instants for a short-lived effect).
 */
export function hasHorizontalLineAtRow(
  decoded: DecodedPixels,
  y: number,
  backgroundLuminance: number,
  {
    tolerancePx = 2,
    minLuminanceDelta = LINE_LUMINANCE_DELTA,
    minWidthFraction = LINE_MIN_WIDTH_FRACTION,
  }: {
    tolerancePx?: number;
    minLuminanceDelta?: number;
    minWidthFraction?: number;
  } = {},
): boolean {
  const { data, width, height } = decoded;
  const rowStart = Math.max(0, Math.floor(y - tolerancePx));
  const rowEnd = Math.min(height, Math.ceil(y + tolerancePx) + 1);

  for (let row = rowStart; row < rowEnd; row++) {
    let paintedColumns = 0;
    for (let x = 0; x < width; x++) {
      const i = (row * width + x) * 4;
      const luminance =
        LUMA_WEIGHT_RED * data[i] +
        LUMA_WEIGHT_GREEN * data[i + 1] +
        LUMA_WEIGHT_BLUE * data[i + 2];
      if (Math.abs(luminance - backgroundLuminance) > minLuminanceDelta) {
        paintedColumns++;
      }
    }
    if (paintedColumns / width >= minWidthFraction) return true;
  }
  return false;
}

/**
 * Screenshots `clip` and decodes it to raw RGBA pixel data in the page
 * context, returned as a plain number array (typed arrays don't survive
 * the `page.evaluate` round trip).
 */
export async function decodeClip(
  page: Page,
  clip: PixelClip,
): Promise<DecodedPixels> {
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
