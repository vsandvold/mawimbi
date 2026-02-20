import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LONG_AUDIO = path.join(__dirname, 'fixtures', 'test-tone-10s.wav');

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
 * Scrolls the timeline horizontally using a mouse wheel event.
 * This simulates real user scrolling and triggers the wheel event handler.
 */
async function wheelScrollTimeline(
  page: import('@playwright/test').Page,
  deltaX: number,
) {
  const timeline = page.locator('.scrubber__timeline');
  await timeline.hover();
  await page.mouse.wheel(deltaX, 0);
}

test.describe('Drag and scroll timeline to seek while playing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__waveform')).toBeVisible();
  });

  test('scrolling the timeline during playback pauses, then resumes at new position', async ({
    page,
  }) => {
    // Start playback
    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();

    // Let playback advance briefly
    await page.waitForTimeout(300);

    // User scrolls the timeline with mouse wheel while playing
    await wheelScrollTimeline(page, 400);

    // Playback should pause during the scroll
    await expect(page.getByTitle('Play')).toBeVisible();

    // Wait for the 200ms debounce to complete and playback to resume
    await page.waitForTimeout(400);

    // Playback should resume
    await expect(page.getByTitle('Pause')).toBeVisible();
  });

  test('scrolling the timeline while paused does not auto-resume', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');

    // Ensure we are paused
    await expect(page.getByTitle('Play')).toBeVisible();

    // Scroll the timeline while paused (using evaluate since we're paused
    // and there's no animation loop race)
    await timeline.evaluate((el) => {
      el.scrollLeft = 400;
    });

    // Wait for debounce
    await page.waitForTimeout(400);

    // Should still be paused — no auto-resume when not playing
    await expect(page.getByTitle('Play')).toBeVisible();
  });

  test('scroll position updates transport time during playback seek', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');

    // Record initial scroll position
    const initialScrollLeft = await timeline.evaluate((el) => el.scrollLeft);

    // Start playback
    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();

    await page.waitForTimeout(200);

    // User scrolls the timeline with mouse wheel while playing
    await wheelScrollTimeline(page, 400);

    // Playback pauses
    await expect(page.getByTitle('Play')).toBeVisible();

    // Wait for debounce and resume
    await page.waitForTimeout(400);

    // Playback resumed
    await expect(page.getByTitle('Pause')).toBeVisible();

    // Pause to check the scroll position has advanced from wheel scroll
    await page.getByTitle('Pause').click();
    await page.waitForTimeout(100);

    const scrollLeft = await timeline.evaluate((el) => el.scrollLeft);
    // Scroll position should have moved forward from the initial position
    // by a significant amount due to the wheel scroll + brief resumed playback
    expect(scrollLeft).toBeGreaterThan(initialScrollLeft + 50);
  });

  test('cursor loses playing class when scroll pauses playback', async ({
    page,
  }) => {
    const cursor = page.locator('.cursor');

    // Start playback
    await page.getByTitle('Play').click();
    await expect(cursor).toHaveClass(/cursor--is-playing/);

    // Scroll to pause
    await wheelScrollTimeline(page, 400);

    // Cursor should lose the playing class while paused
    await expect(cursor).not.toHaveClass(/cursor--is-playing/);

    // Wait for debounce and resume
    await page.waitForTimeout(400);

    // Cursor should regain the playing class
    await expect(cursor).toHaveClass(/cursor--is-playing/);
  });
});
