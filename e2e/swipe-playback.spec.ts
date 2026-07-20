import {
  expect,
  test,
  uploadAudioFile,
  LONG_AUDIO_10S,
  swipeTimeline,
} from './fixtures';

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

  test('swiping while paused does not auto-resume', async ({ page }) => {
    await expect(page.getByTitle('Play')).toBeVisible();

    await swipeTimeline(page, 300);
    await page.waitForTimeout(400);

    // Should still be paused
    await expect(page.getByTitle('Play')).toBeVisible();
  });
});
