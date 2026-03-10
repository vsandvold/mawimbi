import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from './fixtures';

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
 * Measures the fraction of VISIBLE canvas rows (the portion within the
 * browser viewport) that contain at least one non-transparent pixel.
 *
 * This accounts for the sticky canvas being partially off-screen: only
 * the rows actually visible to the user are checked.
 */
async function visibleCanvasFilledHeightRatio(
  canvasLocator: import('@playwright/test').Locator,
): Promise<number> {
  return canvasLocator.evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) return 0;

    const canvasRect = canvas.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Determine the visible row range (canvas-local coordinates)
    const visibleTop = Math.max(0, -canvasRect.top);
    const visibleBottom = Math.min(
      canvas.height,
      viewportHeight - canvasRect.top,
    );

    if (visibleBottom <= visibleTop) return 0;

    const visibleHeight = Math.floor(visibleBottom - visibleTop);
    const startRow = Math.floor(visibleTop);

    const imageData = ctx.getImageData(
      0,
      startRow,
      canvas.width,
      visibleHeight,
    );
    const pixels = imageData.data;
    const width = canvas.width;
    let filledRows = 0;

    for (let row = 0; row < visibleHeight; row++) {
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

    return filledRows / visibleHeight;
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

test.describe('Spectrogram alignment with cursor at time=0', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('spectrogram bottom edge aligns with cursor position', async ({
    page,
  }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO);

    const spectrogramCanvas = page.locator('.spectrogram__canvas');
    await expect(spectrogramCanvas).toBeVisible({ timeout: 15000 });

    await expect(async () => {
      const hasContent = await canvasHasContent(spectrogramCanvas);
      expect(hasContent).toBe(true);
    }).toPass({ timeout: 15000 });

    // At time=0, the spectrogram's bottom edge (beginning of audio) should
    // align with the cursor/playhead position. The cursor is at 25% of the
    // scrubber height, and the timeline padding must match so the content
    // boundary lands exactly on the cursor.
    const alignment = await page.evaluate(() => {
      const scrollContainer = document.querySelector(
        '.scrubber__timeline',
      ) as HTMLElement;
      const spectrogram = document.querySelector(
        '.spectrogram',
      ) as HTMLElement;
      const cursor = document.querySelector(
        '.scrubber__cursor',
      ) as HTMLElement;

      const spectrogramRect = spectrogram.getBoundingClientRect();
      const cursorRect = cursor.getBoundingClientRect();
      const scrollRect = scrollContainer.getBoundingClientRect();

      // The cursor center (playhead line) is at the vertical midpoint of
      // the 240px-tall cursor element.
      const cursorCenter = cursorRect.top + cursorRect.height / 2;

      return {
        spectrogramBottom: spectrogramRect.bottom,
        cursorCenter,
        scrollContainerTop: scrollRect.top,
        scrollContainerHeight: scrollContainer.clientHeight,
      };
    });

    // The spectrogram bottom should be within 2px of the cursor center.
    // A larger gap indicates the timeline padding (100vh) doesn't match
    // the cursor position (% of scrubber height).
    expect(
      alignment.spectrogramBottom,
      `Spectrogram bottom (${alignment.spectrogramBottom.toFixed(1)}px) is not aligned ` +
        `with cursor center (${alignment.cursorCenter.toFixed(1)}px). ` +
        `Gap: ${Math.abs(alignment.spectrogramBottom - alignment.cursorCenter).toFixed(1)}px. ` +
        `Scroll container: top=${alignment.scrollContainerTop.toFixed(1)}px, ` +
        `height=${alignment.scrollContainerHeight}px`,
    ).toBeCloseTo(alignment.cursorCenter, 0);
  });
});

test.describe('Spectrogram canvas sticky positioning on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO);

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
    const scrollContainer = page.locator('.scrubber__timeline');
    const spectrogramCanvas = page.locator('.spectrogram__canvas');

    const paddingTop = await scrollContainer.evaluate((el) => {
      const tl = el.querySelector('.timeline') as HTMLElement;
      return parseFloat(getComputedStyle(tl).paddingTop);
    });

    // Scroll well past the padding so sticky positioning is active
    const scrollPos = Math.floor(paddingTop + 300);
    await scrollContainer.evaluate((el, pos) => {
      el.scrollTop = pos;
    }, scrollPos);
    await page.waitForTimeout(200);

    const { canvasTop, scrollContainerTop } = await page.evaluate(() => {
      const canvas = document.querySelector(
        '.spectrogram__canvas',
      ) as HTMLCanvasElement;
      const scrollEl = document.querySelector(
        '.scrubber__timeline',
      ) as HTMLElement;
      return {
        canvasTop: canvas.getBoundingClientRect().top,
        scrollContainerTop: scrollEl.getBoundingClientRect().top,
      };
    });

    // The canvas should stick at the scroll container's top edge (sticky
    // top: 0), not offset by the timeline's padding-top. The scroll
    // container may be below the viewport top due to the project header.
    expect(
      canvasTop,
      `Canvas top edge is at ${canvasTop}px instead of scroll container top ` +
        `(${scrollContainerTop}px) — it is stuck at the content edge ` +
        `(paddingTop=${paddingTop}) instead of the scroll container edge`,
    ).toBeCloseTo(scrollContainerTop, 0);
  });
});

test.describe('Spectrogram timeline visualization during scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
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
    const scrollContainer = page.locator('.scrubber__timeline');
    const spectrogramCanvas = page.locator('.spectrogram__canvas');

    // Compute the scroll position where the spectrogram container's top
    // edge aligns with the scroll parent's top edge. Beyond this point,
    // contentOffset increases and the canvas draws different audio content.
    const paddingTop = await scrollContainer.evaluate((el) => {
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
    await scrollContainer.evaluate((el, pos) => {
      el.scrollTop = pos;
    }, scrollA);
    await page.waitForTimeout(200);

    const hashA = await getCanvasPixelHash();

    // Scroll further into the content range
    const scrollB = scrollA + 400;
    await scrollContainer.evaluate((el, pos) => {
      el.scrollTop = pos;
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

  test('spectrogram coverage is consistent across the full scroll range', async ({
    page,
  }) => {
    const scrollContainer = page.locator('.scrubber__timeline');
    const spectrogramCanvas = page.locator('.spectrogram__canvas');

    const contentInfo = await scrollContainer.evaluate((el) => {
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

    const numSteps = 10;
    const results: Array<{ scrollPos: number; ratio: number }> = [];

    for (let i = 0; i <= numSteps; i++) {
      const scrollPos = Math.floor(
        scanStart + ((scanEnd - scanStart) * i) / numSteps,
      );
      if (scrollPos < 0 || scrollPos > maxScroll) continue;

      await scrollContainer.evaluate((el, pos) => {
        el.scrollTop = pos;
      }, scrollPos);
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
