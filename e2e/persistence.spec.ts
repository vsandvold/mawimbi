import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from './fixtures';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHORT_AUDIO = path.join(__dirname, 'fixtures', 'test-tone-short.wav');

async function uploadAudioFile(
  page: import('@playwright/test').Page,
  filePath: string,
) {
  const fileInput = page.locator('.toolbar input[type="file"]');
  await fileInput.setInputFiles(filePath);
}

test.describe('Project data persistence across page reload', () => {
  test('uploaded track survives reload and project appears on home page', async ({
    page,
  }) => {
    // Create a project from the home page
    await page.goto('/');
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page).toHaveURL(/\/project\//);

    // Upload a track
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    // Wait for auto-save debounce (250ms) plus buffer
    await page.waitForTimeout(500);

    // Hard reload — track should survive
    await page.reload();
    await expect(page.locator('.timeline__track')).toBeVisible({
      timeout: 10_000,
    });

    // Navigate home — project should be listed with its track count
    await page.goto('/');
    await expect(page.getByText('1 track')).toBeVisible();
  });
});
