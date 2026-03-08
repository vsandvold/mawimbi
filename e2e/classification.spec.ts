import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHORT_AUDIO = path.join(__dirname, 'fixtures', 'test-tone-short.wav');

async function uploadAudioFile(
  page: import('@playwright/test').Page,
  filePath: string,
) {
  const fileInput = page.locator('.project-page-header input[type="file"]');
  await fileInput.setInputFiles(filePath);
}

test.describe('Instrument classification on upload', () => {
  test('classifies instrument without CORS errors after file upload', async ({
    page,
  }) => {
    const corsErrors: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('CORS') ||
        (text.includes('essentia.upf.edu') && msg.type() === 'error')
      ) {
        corsErrors.push(text);
      }
    });

    await page.goto('/project/test-classification');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    // Open the mixer to see the channel with classification state
    await page.getByTitle('Show mixer').click();
    await expect(page.locator('.channel')).toBeVisible();

    // Wait for classification to finish (loading spinner should disappear).
    // The channel__instrument div shows a Loader2 spinner while
    // classifying, then switches to an instrument icon or nothing.
    const instrumentDiv = page.locator('.channel__instrument');

    // Classification should complete — the loading spinner should disappear
    // within a reasonable timeout. With the CORS bug, the worker fails and
    // the main-thread fallback also fails, so classification enters 'error'
    // state and shows the unknown icon. Without the bug, models would load
    // and classification would show the correct instrument icon.
    await expect(instrumentDiv.locator('.animate-spin')).toBeHidden({
      timeout: 15_000,
    });

    // No CORS errors should appear — model fetches must go through a
    // same-origin proxy to avoid cross-origin restrictions.
    expect(corsErrors).toEqual([]);
  });
});
