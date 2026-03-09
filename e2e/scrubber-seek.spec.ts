import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from './fixtures';

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
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();
  });

  test('scrolling during playback pauses, resumes, and updates scroll position', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');
    const initialScrollLeft = await timeline.evaluate((el) => el.scrollLeft);

    // Start playback
    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();
    await page.waitForTimeout(300);

    // Scroll while playing → pauses
    await wheelScrollTimeline(page, 400);
    await expect(page.getByTitle('Play')).toBeVisible();

    // Wait for debounce → resumes
    await page.waitForTimeout(400);
    await expect(page.getByTitle('Pause')).toBeVisible();

    // Verify scroll position advanced
    await page.getByTitle('Pause').click();
    await page.waitForTimeout(100);
    const scrollLeft = await timeline.evaluate((el) => el.scrollLeft);
    expect(scrollLeft).toBeGreaterThan(initialScrollLeft + 50);
  });

  test('scrolling the timeline while paused does not auto-resume', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');

    await expect(page.getByTitle('Play')).toBeVisible();

    await timeline.evaluate((el) => {
      el.scrollLeft = 400;
    });
    await page.waitForTimeout(400);

    // Should still be paused
    await expect(page.getByTitle('Play')).toBeVisible();
  });
});
