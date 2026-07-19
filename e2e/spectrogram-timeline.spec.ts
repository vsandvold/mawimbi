import {
  expect,
  test,
  uploadAudioFile,
  CHIRP_AUDIO_10S,
} from './fixtures';

/**
 * Spectrogram canvas-window invariants.
 *
 * The spectrogram canvas covers the runway's *canvas window* — the fixed
 * pre-transform span that can project into view (mawimbi#459) — and stays
 * put while the scrubber's offset stage moves the surrounding content.
 * Scrolling therefore never moves the canvas element; it shifts which
 * slice of audio content is drawn *inside* it. These tests pin down that
 * split: the canvas element is stationary across scroll positions, and
 * the drawn content tracks the scroll offset exactly.
 */

/**
 * Returns true if the canvas has at least `threshold` non-transparent pixels.
 */
async function canvasHasContent(
  canvasLocator: import('@playwright/test').Locator,
  threshold = 50,
): Promise<boolean> {
  return canvasLocator.evaluate((canvas: HTMLCanvasElement, thresh: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) return false;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let nonTransparentCount = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) {
        nonTransparentCount++;
        if (nonTransparentCount >= thresh) return true;
      }
    }
    return false;
  }, threshold);
}

/**
 * The first (topmost) canvas bitmap row containing any non-transparent
 * pixel, or -1 if the canvas is empty. Content rows move 1:1 with scroll
 * position, so this is the observable for scroll-tracking assertions.
 */
async function firstFilledCanvasRow(
  canvasLocator: import('@playwright/test').Locator,
): Promise<number> {
  return canvasLocator.evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) return -1;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    for (let row = 0; row < canvas.height; row++) {
      for (let col = 0; col < canvas.width; col += 4) {
        if (pixels[(row * canvas.width + col) * 4 + 3] > 0) {
          return row;
        }
      }
    }
    return -1;
  });
}

/**
 * Scrolls the phantom scroller — the scrubber's only scroll container.
 * The offset stage and spectrogram canvases follow via the scroll event.
 */
async function scrollTimeline(
  page: import('@playwright/test').Page,
  scrollTop: number,
) {
  await page.evaluate((pos) => {
    const phantom = document.querySelector('.scrubber__phantom') as HTMLElement;
    if (phantom) phantom.scrollTop = pos;
  }, scrollTop);
}

async function getTimelinePaddingTop(
  page: import('@playwright/test').Page,
): Promise<number> {
  return page.evaluate(() => {
    const tl = document.querySelector('.timeline') as HTMLElement;
    return parseFloat(getComputedStyle(tl).paddingTop);
  });
}

test.describe('Spectrogram canvas window', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, CHIRP_AUDIO_10S);

    const spectrogramCanvas = page.locator('.spectrogram__canvas');
    await expect(spectrogramCanvas).toBeVisible({ timeout: 15000 });

    await expect(async () => {
      const hasContent = await canvasHasContent(spectrogramCanvas);
      expect(hasContent).toBe(true);
    }).toPass({ timeout: 15000 });
  });

  test('canvas element is stationary across scroll positions', async ({
    page,
  }) => {
    const spectrogramCanvas = page.locator('.spectrogram__canvas');
    const paddingTop = await getTimelinePaddingTop(page);

    await scrollTimeline(page, Math.floor(paddingTop + 100));
    await page.waitForTimeout(200);
    const rectA = await spectrogramCanvas.evaluate((el) =>
      el.getBoundingClientRect().toJSON(),
    );

    await scrollTimeline(page, Math.floor(paddingTop + 300));
    await page.waitForTimeout(200);
    const rectB = await spectrogramCanvas.evaluate((el) =>
      el.getBoundingClientRect().toJSON(),
    );

    // The canvas covers the runway window, which is fixed in screen space —
    // scrolling moves content within it, never the canvas itself.
    expect(rectB.top).toBeCloseTo(rectA.top, 1);
    expect(rectB.bottom).toBeCloseTo(rectA.bottom, 1);
  });

  test('drawn content tracks the scroll offset exactly', async ({ page }) => {
    const spectrogramCanvas = page.locator('.spectrogram__canvas');
    const paddingTop = await getTimelinePaddingTop(page);

    const scrollA = Math.floor(paddingTop + 100);
    await scrollTimeline(page, scrollA);
    await page.waitForTimeout(200);
    const rowA = await firstFilledCanvasRow(spectrogramCanvas);
    expect(rowA).toBeGreaterThanOrEqual(0);

    const scrollDelta = 150;
    await scrollTimeline(page, scrollA + scrollDelta);
    await page.waitForTimeout(200);
    const rowB = await firstFilledCanvasRow(spectrogramCanvas);
    expect(rowB).toBeGreaterThanOrEqual(0);

    // Increasing scrollTop moves the window deeper into the content, so the
    // content's top edge moves up the bitmap by exactly the scroll delta.
    // (A frozen canvas — the #419/#420 bug class — fails with rowB == rowA.)
    expect(Math.abs(rowA - rowB - scrollDelta)).toBeLessThanOrEqual(2);
  });
});
