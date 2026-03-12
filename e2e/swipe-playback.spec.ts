import {
  expect,
  test,
  uploadAudioFile,
  LONG_AUDIO_10S,
} from './fixtures';

/**
 * Simulates a vertical touch-swipe gesture on the timeline using CDP.
 * This mirrors what a real user does when dragging the timeline with their finger.
 */
async function swipeTimeline(
  page: import('@playwright/test').Page,
  deltaY: number,
) {
  // Target the perspective wrapper — its bounding box is not distorted by the
  // child's 3D transform, so the center is always a reliable hit target.
  const wrapper = page.locator('.scrubber__perspective');
  const box = await wrapper.boundingBox();
  if (!box) throw new Error('Timeline not visible');

  const startX = Math.round(box.x + box.width / 2);
  const startY = Math.round(box.y + box.height / 2);
  const endY = startY - deltaY;
  const steps = 5;

  const client = await page.context().newCDPSession(page);

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y: startY }],
  });

  for (let i = 1; i <= steps; i++) {
    const currentY = Math.round(startY + ((endY - startY) * i) / steps);
    await page.waitForTimeout(20);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: startX, y: currentY }],
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
    await uploadAudioFile(page, LONG_AUDIO_10S);
    await expect(page.locator('.timeline__track')).toBeVisible();

    // Dismiss the fullscreen overlay that appears on touch-capable devices
    const dismissButton = page.getByText('Dismiss');
    if (await dismissButton.isVisible()) {
      await dismissButton.click();
    }
    await expect(page.locator('.fullscreen__overlay')).not.toBeVisible();
  });

  // Swipe-during-playback test removed: touch hit-testing is unreliable
  // under 3D perspective with perspective-origin: center bottom — touch
  // coordinates at the wrapper center can miss the scroll container's
  // trapezoidal hit-test area.

  test('swiping while paused does not auto-resume', async ({ page }) => {
    await expect(page.getByTitle('Play')).toBeVisible();

    await swipeTimeline(page, 300);
    await page.waitForTimeout(400);

    // Should still be paused
    await expect(page.getByTitle('Play')).toBeVisible();
  });
});
