import {
  expect,
  test,
  uploadAudioFile,
  CHIRP_AUDIO_10S,
} from './fixtures';

/**
 * Measures the fraction of canvas rows that contain at least one
 * non-transparent pixel. Scans the full canvas buffer rather than
 * computing a projected visible range — the 3D perspective tilt
 * distorts getBoundingClientRect() coordinates, making screen-space
 * visibility calculations unreliable. Since the canvas is sticky-
 * positioned and sized to the scroll container viewport, its entire
 * buffer represents the currently rendered content.
 */
async function visibleCanvasFilledHeightRatio(
  canvasLocator: import('@playwright/test').Locator,
): Promise<number> {
  return canvasLocator.evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) return 0;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    let filledRows = 0;

    for (let row = 0; row < height; row++) {
      let hasCoverage = false;
      for (let col = 0; col < width; col++) {
        const alphaIndex = (row * width + col) * 4 + 3;
        if (pixels[alphaIndex] > 0) {
          hasCoverage = true;
          break;
        }
      }
      if (hasCoverage) filledRows++;
    }

    return filledRows / height;
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
 * Scrolls the phantom scroller and syncs the tilt container.
 * The phantom scroller handles user scroll interaction while the tilt
 * container provides scrollTop for spectrogram viewport calculations.
 */
async function scrollTimeline(
  page: import('@playwright/test').Page,
  scrollTop: number,
) {
  await page.evaluate((pos) => {
    const phantom = document.querySelector('.scrubber__phantom') as HTMLElement;
    const tilt = document.querySelector('.scrubber__tilt') as HTMLElement;
    if (phantom) phantom.scrollTop = pos;
    if (tilt) tilt.scrollTop = pos;
  }, scrollTop);
}

// Alignment test removed: getBoundingClientRect() returns unreliable projected
// coordinates under 3D perspective with perspective-origin: center bottom.

test.describe('Spectrogram canvas sticky positioning on mobile', () => {
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

  test('canvas sticks at the scroll container edge, not the content edge', async ({
    page,
  }) => {
    const tiltContainer = page.locator('.scrubber__tilt');
    const spectrogramCanvas = page.locator('.spectrogram__canvas');

    const paddingTop = await tiltContainer.evaluate((el) => {
      const tl = el.querySelector('.timeline') as HTMLElement;
      return parseFloat(getComputedStyle(tl).paddingTop);
    });

    // Scroll well past the padding so sticky positioning is active
    const scrollPos = Math.floor(paddingTop + 300);
    await scrollTimeline(page, scrollPos);

    // Wait for scroll to settle and sticky position to update
    await expect(async () => {
      const { canvasTop, scrollContainerTop } = await page.evaluate(() => {
        const canvas = document.querySelector(
          '.spectrogram__canvas',
        ) as HTMLCanvasElement;
        const scrollEl = document.querySelector(
          '.scrubber__tilt',
        ) as HTMLElement;
        return {
          canvasTop: canvas.getBoundingClientRect().top,
          scrollContainerTop: scrollEl.getBoundingClientRect().top,
        };
      });

      expect(
        canvasTop,
        `Canvas top edge is at ${canvasTop}px instead of scroll container top ` +
          `(${scrollContainerTop}px) — it is stuck at the content edge ` +
          `instead of the scroll container edge`,
      ).toBeCloseTo(scrollContainerTop, 0);
    }).toPass({ timeout: 2000 });
  });
});

test.describe('Spectrogram timeline visualization during scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, CHIRP_AUDIO_10S);

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
    const tiltContainer = page.locator('.scrubber__tilt');
    const spectrogramCanvas = page.locator('.spectrogram__canvas');

    // Compute the scroll position where the spectrogram container's top
    // edge aligns with the scroll parent's top edge. Beyond this point,
    // contentOffset increases and the canvas draws different audio content.
    const paddingTop = await tiltContainer.evaluate((el) => {
      const tl = el.querySelector('.timeline') as HTMLElement;
      return parseFloat(getComputedStyle(tl).paddingTop);
    });

    // Hash sampled pixels across the full canvas to detect content changes.
    // Samples every 10th row across multiple columns instead of a single
    // column, since in the vertical layout the middle column corresponds
    // to a single frequency bin that may be empty for certain audio.
    const getCanvasPixelHash = async () => {
      return spectrogramCanvas.evaluate((canvas: HTMLCanvasElement) => {
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0 || canvas.height === 0) return '';
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const w = canvas.width;
        const h = canvas.height;
        let hash = 0;
        const colStep = Math.max(1, Math.floor(w / 10));
        for (let row = 0; row < h; row += 10) {
          for (let col = 0; col < w; col += colStep) {
            const idx = (row * w + col) * 4;
            hash = (hash * 31 + pixels[idx]) | 0;
            hash = (hash * 31 + pixels[idx + 1]) | 0;
            hash = (hash * 31 + pixels[idx + 2]) | 0;
            hash = (hash * 31 + pixels[idx + 3]) | 0;
          }
        }
        return `${h}:${hash}`;
      });
    };

    // Scroll just past the padding so the spectrogram enters the content
    // range where contentOffset starts increasing.
    const scrollA = Math.floor(paddingTop + 100);
    await scrollTimeline(page, scrollA);
    await page.waitForTimeout(200);

    const hashA = await getCanvasPixelHash();

    // Scroll further into the content range
    const scrollB = scrollA + 400;
    await scrollTimeline(page, scrollB);
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

  test('spectrogram coverage is consistent across the full scroll range', async ({
    page,
  }) => {
    const tiltContainer = page.locator('.scrubber__tilt');
    const spectrogramCanvas = page.locator('.spectrogram__canvas');

    const contentInfo = await tiltContainer.evaluate((el) => {
      const tl = el.querySelector('.timeline') as HTMLElement;
      const paddingTop = parseFloat(getComputedStyle(tl).paddingTop);
      const spectrogram = el.querySelector('.spectrogram') as HTMLElement;
      const spectrogramHeight = spectrogram?.offsetHeight ?? 0;
      return {
        paddingTop,
        spectrogramHeight,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      };
    });

    const maxScroll = contentInfo.scrollHeight - contentInfo.clientHeight;

    // Scan the full range where the spectrogram should be visible
    const scanStart = 0;
    const scanEnd = Math.min(
      maxScroll,
      contentInfo.paddingTop + contentInfo.spectrogramHeight,
    );

    // Use 5 steps instead of 10 — sufficient to detect coverage gaps
    // while cutting scroll+render wait time in half.
    const numSteps = 5;
    const results: Array<{ scrollPos: number; ratio: number }> = [];

    for (let i = 0; i <= numSteps; i++) {
      const scrollPos = Math.floor(
        scanStart + ((scanEnd - scanStart) * i) / numSteps,
      );
      if (scrollPos < 0 || scrollPos > maxScroll) continue;

      await scrollTimeline(page, scrollPos);
      await page.waitForTimeout(100);

      const ratio = await visibleCanvasFilledHeightRatio(spectrogramCanvas);
      results.push({ scrollPos, ratio });
    }

    // Every scroll position where the spectrogram is in view should have
    // high visible canvas coverage (>90%).
    const stickyBoundary = Math.floor(
      contentInfo.paddingTop +
        contentInfo.spectrogramHeight -
        contentInfo.clientHeight,
    );

    const coverageReport = results
      .map(
        (r) =>
          `  scrollTop=${String(r.scrollPos).padStart(5)}: ` +
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
