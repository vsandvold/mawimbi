import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIO_FILE = path.join(__dirname, 'fixtures', 'test-chirp-10s.wav');

async function uploadAudioFile(
  page: import('@playwright/test').Page,
  filePath: string,
) {
  const fileInput = page.locator('.project-page-header input[type="file"]');
  await fileInput.setInputFiles(filePath);
}

test.describe('Toolbar stays within viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('toolbar is visible after uploading an audio file', async ({
    page,
  }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, AUDIO_FILE);

    // Wait for spectrogram to appear, confirming the track loaded
    const spectrogram = page.locator('.spectrogram__canvas');
    await expect(spectrogram).toBeVisible({ timeout: 15000 });

    const toolbar = page.locator('.toolbar');
    await expect(toolbar).toBeVisible();

    // Verify the toolbar is within the viewport, not pushed off-screen
    const toolbarBox = await toolbar.boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(
      toolbarBox!.y + toolbarBox!.height,
      'Toolbar bottom edge should be within viewport',
    ).toBeLessThanOrEqual(844);
    expect(
      toolbarBox!.y,
      'Toolbar top edge should be within viewport',
    ).toBeGreaterThanOrEqual(0);
  });
});
