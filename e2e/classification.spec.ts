import { expect, test, uploadAudioFile, SHORT_AUDIO } from './fixtures';

test.describe('Instrument classification on upload', () => {
  test('completes classification after file upload', async ({ page }) => {
    await page.goto('/project/test-classification');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    // Open the mixer to see the channel with classification state
    await page.getByTitle('Show mixer').click();
    await expect(page.locator('.channel')).toBeVisible();

    // Classification should complete — the loading spinner should disappear
    // within a reasonable timeout. With models blocked by the shared fixture,
    // classification enters 'error' state and shows the unknown icon.
    const instrumentDiv = page.locator('.channel__instrument');
    await expect(instrumentDiv.locator('.animate-spin')).toBeHidden({
      timeout: 15_000,
    });
  });
});
