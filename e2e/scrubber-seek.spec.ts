import {
  expect,
  test,
  uploadAudioFile,
  LONG_AUDIO_10S,
} from './fixtures';

/**
 * Scrolls the timeline vertically using a mouse wheel event.
 * This simulates real user scrolling and triggers the wheel event handler.
 */
async function wheelScrollTimeline(
  page: import('@playwright/test').Page,
  deltaY: number,
) {
  // Hover the perspective wrapper instead of the transformed scroll container.
  // The 3D perspective tilt can project the scroll container's center outside
  // the viewport, making Playwright's hover() fail. The perspective wrapper
  // is not transformed and forwards wheel events to the scroll container.
  const perspective = page.locator('.scrubber__perspective');
  await perspective.hover();
  await page.mouse.wheel(0, deltaY);
}

test.describe('Drag and scroll timeline to seek while playing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO_10S);
    await expect(page.locator('.timeline__track')).toBeVisible();
  });

  test('scrolling during playback pauses, resumes, and updates scroll position', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');
    const initialScrollTop = await timeline.evaluate((el) => el.scrollTop);

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

    // Verify scroll position changed (inverted scroll: playback decreases scrollTop)
    await page.getByTitle('Pause').click();
    await page.waitForTimeout(100);
    const scrollTop = await timeline.evaluate((el) => el.scrollTop);
    expect(scrollTop).not.toBe(initialScrollTop);
  });

  test('scrolling the timeline while paused does not auto-resume', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');

    await expect(page.getByTitle('Play')).toBeVisible();

    await timeline.evaluate((el) => {
      el.scrollTop = 400;
    });
    await page.waitForTimeout(400);

    // Should still be paused
    await expect(page.getByTitle('Play')).toBeVisible();
  });
});
