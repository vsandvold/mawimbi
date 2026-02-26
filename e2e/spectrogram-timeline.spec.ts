import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LONG_AUDIO = path.join(__dirname, 'fixtures', 'test-chirp-10s.wav');

/**
 * Uploads an audio file via the hidden file input inside the Ant Design Upload component.
 */
async function uploadAudioFile(
  page: import('@playwright/test').Page,
  filePath: string,
) {
  const fileInput = page.locator('.project-page-header input[type="file"]');
  await fileInput.setInputFiles(filePath);
}

/**
 * Measures the fraction of VISIBLE canvas columns (the portion within the
 * browser viewport) that contain at least one non-transparent pixel.
 *
 * This accounts for the sticky canvas being partially off-screen: only
 * the columns actually visible to the user are checked.
 */
async function visibleCanvasFilledWidthRatio(
  canvasLocator: import('@playwright/test').Locator,
): Promise<number> {
  return canvasLocator.evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) return 0;

    const canvasRect = canvas.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    // Determine the visible column range (canvas-local coordinates)
    const visibleLeft = Math.max(0, -canvasRect.left);
    const visibleRight = Math.min(
      canvas.width,
      viewportWidth - canvasRect.left,
    );

    if (visibleRight <= visibleLeft) return 0;

    const visibleWidth = Math.floor(visibleRight - visibleLeft);
    const startCol = Math.floor(visibleLeft);

    const imageData = ctx.getImageData(
      startCol,
      0,
      visibleWidth,
      canvas.height,
    );
    const pixels = imageData.data;
    const height = canvas.height;
    let filledColumns = 0;

    for (let col = 0; col < visibleWidth; col++) {
      let hasCoverage = false;
      for (let row = 0; row < height; row++) {
        const alphaIndex = (row * visibleWidth + col) * 4 + 3;
        if (pixels[alphaIndex] > 0) {
          hasCoverage = true;
          break;
        }
      }
      if (hasCoverage) filledColumns++;
    }

    return filledColumns / visibleWidth;
  });
}

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
 * addInitScript that forces Spectrogram rendering by removing
 * webkitOfflineAudioContext from the window object, so
 * browserSupport.tsx reports it as absent.
 */
function forceSpectrogramRendering(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    try {
      delete (window as unknown as Record<string, unknown>)
        .webkitOfflineAudioContext;
    } catch {
      /* non-configurable */
    }

    const proto = Object.getPrototypeOf(window);
    if (proto && 'webkitOfflineAudioContext' in proto) {
      try {
        delete proto.webkitOfflineAudioContext;
      } catch {
        /* non-configurable */
      }
    }
  });
}

test.describe('Spectrogram canvas sticky positioning on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await forceSpectrogramRendering(page);
    await page.goto('/project');
    await uploadAudioFile(page, LONG_AUDIO);

    const spectrogramCanvas = page.locator('.spectrogram__canvas');
    await expect(spectrogramCanvas).toBeVisible({ timeout: 15000 });

    await expect(async () => {
      const hasContent = await canvasHasContent(spectrogramCanvas);
      expect(hasContent).toBe(true);
    }).toPass({ timeout: 15000 });
  });

  test('canvas sticks at the viewport edge, not the content edge', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');
    const spectrogramCanvas = page.locator('.spectrogram__canvas');

    const paddingLeft = await timeline.evaluate((el) =>
      parseFloat(getComputedStyle(el).paddingLeft),
    );

    // Scroll well past the padding so sticky positioning is active
    const scrollPos = Math.floor(paddingLeft + 300);
    await timeline.evaluate((el, pos) => {
      el.scrollLeft = pos;
    }, scrollPos);
    await page.waitForTimeout(200);

    const canvasLeft = await spectrogramCanvas.evaluate(
      (canvas: HTMLCanvasElement) => canvas.getBoundingClientRect().left,
    );

    // The canvas should be at the viewport edge (left: 0), not offset
    // by the scroll container's padding-left. On a 390px mobile viewport
    // with 75% cursor position, the padding is ~292px — if the canvas is
    // at the padding edge, only ~25% of the viewport shows spectrogram.
    expect(
      canvasLeft,
      `Canvas left edge is at ${canvasLeft}px instead of 0px — ` +
        `it is stuck at the scroll container content edge (paddingLeft=${paddingLeft}) ` +
        'instead of the viewport edge',
    ).toBeCloseTo(0, 0);
  });
});

test.describe('Spectrogram timeline visualization during scroll', () => {
  test.beforeEach(async ({ page }) => {
    await forceSpectrogramRendering(page);
    await page.goto('/project');
    await uploadAudioFile(page, LONG_AUDIO);

    const spectrogramCanvas = page.locator('.spectrogram__canvas');
    await expect(spectrogramCanvas).toBeVisible({ timeout: 15000 });

    // Wait for spectrogram tiles to finish rendering
    await expect(async () => {
      const hasContent = await canvasHasContent(spectrogramCanvas);
      expect(hasContent).toBe(true);
    }).toPass({ timeout: 15000 });
  });

  test('spectrogram content updates when scrolling into content range', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');
    const spectrogramCanvas = page.locator('.spectrogram__canvas');

    // Compute the scroll position where the spectrogram container's left
    // edge aligns with the scroll parent's left edge. Beyond this point,
    // contentOffset increases and the canvas draws different audio content.
    const paddingLeft = await timeline.evaluate((el) =>
      parseFloat(getComputedStyle(el).paddingLeft),
    );

    // Hash the full canvas pixel buffer (not just the visible strip),
    // since the canvas is sticky and may be partially off-screen before
    // the content range.
    const getCanvasPixelHash = async () => {
      return spectrogramCanvas.evaluate((canvas: HTMLCanvasElement) => {
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0 || canvas.height === 0) return '';
        const midRow = Math.floor(canvas.height / 2);
        const strip = ctx.getImageData(0, midRow, canvas.width, 1);
        let hash = 0;
        for (let i = 0; i < strip.data.length; i++) {
          hash = (hash * 31 + strip.data[i]) | 0;
        }
        return `${canvas.width}:${hash}`;
      });
    };

    // Scroll just past the padding so the spectrogram enters the content
    // range where contentOffset starts increasing.
    const scrollA = Math.floor(paddingLeft + 100);
    await timeline.evaluate((el, pos) => {
      el.scrollLeft = pos;
    }, scrollA);
    await page.waitForTimeout(200);

    const hashA = await getCanvasPixelHash();

    // Scroll further into the content range
    const scrollB = scrollA + 400;
    await timeline.evaluate((el, pos) => {
      el.scrollLeft = pos;
    }, scrollB);
    await page.waitForTimeout(200);

    const hashB = await getCanvasPixelHash();

    // The pixel content must differ — proving the spectrogram redraws
    // with different audio content as the user scrolls. With the original
    // bug (contentOffset stuck at 0), both positions produced identical pixels.
    expect(
      hashB,
      `Spectrogram content did not change after scrolling from ${scrollA} to ${scrollB} — ` +
        'the spectrogram appears frozen',
    ).not.toBe(hashA);
  });

  test('spectrogram fills the visible canvas when scrolled into content', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');
    const spectrogramCanvas = page.locator('.spectrogram__canvas');

    // Scroll to mid-content where the sticky canvas should be fully visible
    const contentInfo = await timeline.evaluate((el) => {
      const paddingLeft = parseFloat(getComputedStyle(el).paddingLeft);
      const spectrogram = el.querySelector('.spectrogram') as HTMLElement;
      const spectrogramWidth = spectrogram?.offsetWidth ?? 0;
      return { paddingLeft, spectrogramWidth, clientWidth: el.clientWidth };
    });

    const midScroll = Math.floor(
      contentInfo.paddingLeft +
        (contentInfo.spectrogramWidth - contentInfo.clientWidth) / 2,
    );

    await timeline.evaluate((el, pos) => {
      el.scrollLeft = pos;
    }, midScroll);
    await page.waitForTimeout(200);

    const ratio = await visibleCanvasFilledWidthRatio(spectrogramCanvas);
    expect(ratio).toBeGreaterThan(0.95);
  });

  test('spectrogram visible canvas stays filled past the sticky boundary', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');
    const spectrogramCanvas = page.locator('.spectrogram__canvas');

    const contentInfo = await timeline.evaluate((el) => {
      const paddingLeft = parseFloat(getComputedStyle(el).paddingLeft);
      const spectrogram = el.querySelector('.spectrogram') as HTMLElement;
      const spectrogramWidth = spectrogram?.offsetWidth ?? 0;
      return {
        paddingLeft,
        spectrogramWidth,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
      };
    });

    // The sticky boundary is where the canvas can no longer be pinned at
    // its sticky position because it reaches the right edge of its
    // container. Past this point, the canvas slides left, and the
    // visible spectrogram should still be fully filled.
    const stickyBoundary = Math.floor(
      contentInfo.paddingLeft +
        contentInfo.spectrogramWidth -
        contentInfo.clientWidth,
    );
    const maxScroll = contentInfo.scrollWidth - contentInfo.clientWidth;

    // Test at positions PAST the sticky boundary
    const testPositions = [
      stickyBoundary + 50,
      stickyBoundary + 200,
      maxScroll,
    ].filter((pos) => pos > 0 && pos <= maxScroll);

    const results: Array<{ scrollPos: number; ratio: number }> = [];

    for (const scrollPos of testPositions) {
      await timeline.evaluate((el, pos) => {
        el.scrollLeft = pos;
      }, scrollPos);
      await page.waitForTimeout(150);

      const ratio = await visibleCanvasFilledWidthRatio(spectrogramCanvas);
      results.push({ scrollPos, ratio });
    }

    // Past the sticky boundary the spectrogram content is still within the
    // viewport, so the visible canvas should remain fully filled (>90%).
    for (const { scrollPos, ratio } of results) {
      expect(
        ratio,
        `At scrollLeft=${scrollPos} (sticky boundary=${stickyBoundary}), ` +
          `only ${(ratio * 100).toFixed(1)}% of visible canvas was filled — ` +
          `expected >90%`,
      ).toBeGreaterThan(0.9);
    }
  });

  test('spectrogram coverage is consistent across the full scroll range', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');
    const spectrogramCanvas = page.locator('.spectrogram__canvas');

    const contentInfo = await timeline.evaluate((el) => {
      const paddingLeft = parseFloat(getComputedStyle(el).paddingLeft);
      const spectrogram = el.querySelector('.spectrogram') as HTMLElement;
      const spectrogramWidth = spectrogram?.offsetWidth ?? 0;
      return {
        paddingLeft,
        spectrogramWidth,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
      };
    });

    const maxScroll = contentInfo.scrollWidth - contentInfo.clientWidth;

    // Scan the full range where the spectrogram should be visible
    const scanStart = 0;
    const scanEnd = Math.min(
      maxScroll,
      contentInfo.paddingLeft + contentInfo.spectrogramWidth,
    );

    const numSteps = 20;
    const results: Array<{ scrollPos: number; ratio: number }> = [];

    for (let i = 0; i <= numSteps; i++) {
      const scrollPos = Math.floor(
        scanStart + ((scanEnd - scanStart) * i) / numSteps,
      );
      if (scrollPos < 0 || scrollPos > maxScroll) continue;

      await timeline.evaluate((el, pos) => {
        el.scrollLeft = pos;
      }, scrollPos);
      await page.waitForTimeout(100);

      const ratio = await visibleCanvasFilledWidthRatio(spectrogramCanvas);
      results.push({ scrollPos, ratio });
    }

    // Every scroll position where the spectrogram is in view should have
    // high visible canvas coverage (>90%).
    const stickyBoundary = Math.floor(
      contentInfo.paddingLeft +
        contentInfo.spectrogramWidth -
        contentInfo.clientWidth,
    );

    const coverageReport = results
      .map(
        (r) =>
          `  scrollLeft=${String(r.scrollPos).padStart(5)}: ` +
          `${(r.ratio * 100).toFixed(1).padStart(5)}% filled` +
          (r.scrollPos > stickyBoundary ? '  [past sticky boundary]' : ''),
      )
      .join('\n');

    const lowCoveragePositions = results.filter((r) => r.ratio < 0.9);

    expect(
      lowCoveragePositions,
      `Spectrogram had low visible coverage (<90%) at ${lowCoveragePositions.length} of ${results.length} positions ` +
        `(sticky boundary=${stickyBoundary}):\n${coverageReport}`,
    ).toHaveLength(0);
  });
});
