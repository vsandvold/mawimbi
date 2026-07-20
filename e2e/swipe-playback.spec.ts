import {
  expect,
  test,
  uploadAudioFile,
  LONG_AUDIO_10S,
  swipeTimeline,
  dismissFullscreenOverlay,
} from './fixtures';

test.describe('Swipe to scrub timeline during playback', () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO_10S);
    await expect(page.locator('.timeline__track')).toBeVisible();
    await dismissFullscreenOverlay(page);
  });

  test('swiping while paused does not auto-resume', async ({ page }) => {
    await expect(page.getByTitle('Play')).toBeVisible();

    await swipeTimeline(page, 300);
    await page.waitForTimeout(400);

    // Should still be paused
    await expect(page.getByTitle('Play')).toBeVisible();
  });
});
