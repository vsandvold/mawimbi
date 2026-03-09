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

  test('project page - empty state, header, and toolbar', async ({ page }) => {
    await page.goto('/project/test-id');
    await page.waitForSelector('text=Upload');
    await expect(page).toHaveScreenshot('project-empty.png');

    const header = page.locator('.page__header');
    await expect(header).toBeVisible();
    await expect(header).toHaveScreenshot('project-header.png');

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

    // Header has zero padding
    const header = page.locator('.page__header');
    await expect(header).toBeVisible();
    const headerPadding = await header.evaluate(
      (el) => window.getComputedStyle(el).padding,
    );
    expect(headerPadding).toBe('0px');

    // Inner header container has correct padding
    const headerInner = page.locator('.project-page-header');
    await expect(headerInner).toBeVisible();
    const innerPadding = await headerInner.evaluate(
      (el) => window.getComputedStyle(el).padding,
    );
    expect(innerPadding).toBe('16px 24px');

    // Title has correct font size
    const title = page.locator('.project-page-header__title');
    await expect(title).toBeVisible();
    const fontSize = await title.evaluate(
      (el) => window.getComputedStyle(el).fontSize,
    );
    expect(fontSize).toBe('20px');

    // Channel items are vertically centered
    const fileInput = page.locator('.project-page-header input[type="file"]');
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
