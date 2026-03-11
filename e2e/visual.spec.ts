import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from './fixtures';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHORT_AUDIO = path.join(__dirname, 'fixtures', 'test-tone-short.wav');

test.describe('visual regression', () => {
  test('home page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Mawimbi');
    await expect(page).toHaveScreenshot('home.png');
  });

  test('project page - empty state and toolbar', async ({ page }) => {
    await page.goto('/project/test-id');
    await page.waitForSelector('.toolbar');
    await expect(page).toHaveScreenshot('project-empty.png');

    const toolbar = page.locator('.toolbar');
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toHaveScreenshot('toolbar.png');
  });
});

test.describe('dark theme properties', () => {
  test('body has dark background and light text', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Mawimbi');
    const bgColor = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');

    const color = await page.evaluate(
      () => window.getComputedStyle(document.body).color,
    );
    expect(color).not.toBe('rgb(0, 0, 0)');
  });

  test('project page has correct theme styling', async ({ page }) => {
    await page.goto('/project/test-id');

    // Toolbar buttons use custom white color, not default link blue
    const button = page.locator('.toolbar .button').first();
    await expect(button).toBeVisible();
    const buttonColor = await button.evaluate(
      (el) => window.getComputedStyle(el).color,
    );
    expect(buttonColor).not.toBe('rgb(22, 104, 220)');

    // Floating back button is visible
    const backButton = page.locator('.floating-back-button');
    await expect(backButton).toBeVisible();

    // Channel items are vertically centered
    const fileInput = page.locator('.toolbar input[type="file"]');
    await fileInput.setInputFiles(SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(1);

    await page.getByTitle('Show mixer').click();
    await expect(page.locator('.channel')).toHaveCount(1);

    const channel = page.locator('.channel').first();
    const alignItems = await channel.evaluate(
      (el) => window.getComputedStyle(el).alignItems,
    );
    expect(alignItems).toBe('center');
  });
});
