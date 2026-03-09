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
 * Simulates a horizontal touch-swipe gesture on the timeline using CDP.
 * This mirrors what a real user does when dragging the timeline with their finger.
 */
async function swipeTimeline(
  page: import('@playwright/test').Page,
  deltaX: number,
) {
  const timeline = page.locator('.scrubber__timeline');
  const box = await timeline.boundingBox();
  if (!box) throw new Error('Timeline not visible');

  const startX = Math.round(box.x + box.width / 2);
  const startY = Math.round(box.y + box.height / 2);
  const endX = startX - deltaX;
  const steps = 5;

  const client = await page.context().newCDPSession(page);

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y: startY }],
  });

  for (let i = 1; i <= steps; i++) {
    const currentX = Math.round(startX + ((endX - startX) * i) / steps);
    await page.waitForTimeout(20);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: currentX, y: startY }],
    });
  }

  await page.waitForTimeout(20);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  await client.detach();
}

test.describe('Swipe to scrub timeline during playback', () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    // Dismiss the fullscreen overlay that appears on touch-capable devices
    const dismissButton = page.getByText('Dismiss');
    if (await dismissButton.isVisible()) {
      await dismissButton.click();
    }
    await expect(page.locator('.fullscreen__overlay')).not.toBeVisible();
  });

  test('swiping during playback pauses, then resumes at new position', async ({
    page,
  }) => {
    // Start playback
    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();
    await page.waitForTimeout(300);

    // Swipe while playing → pauses
    await swipeTimeline(page, 400);
    await expect(page.getByTitle('Play')).toBeVisible();

    // Wait for debounce → resumes
    await page.waitForTimeout(400);
    await expect(page.getByTitle('Pause')).toBeVisible();
  });

  test('swiping while paused does not auto-resume', async ({ page }) => {
    await expect(page.getByTitle('Play')).toBeVisible();

    await swipeTimeline(page, 300);
    await page.waitForTimeout(400);

    // Should still be paused
    await expect(page.getByTitle('Play')).toBeVisible();
  });
});
