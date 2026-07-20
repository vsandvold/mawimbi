/**
 * Screenshot-decoded-pixel helpers (mawimbi#464 pattern, extracted in #480).
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
  const screenshot = await page.screenshot({ clip });

  return page.evaluate(
    async ({ b64, threshold }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.length; i += 4) {
        const max = Math.max(data[i], data[i + 1], data[i + 2]);
        const min = Math.min(data[i], data[i + 1], data[i + 2]);
        if (max - min > threshold) return true;
      }
      return false;
    },
    { b64: screenshot.toString('base64'), threshold: SATURATION_THRESHOLD },
  );
}
