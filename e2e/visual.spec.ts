import { test, expect } from '@playwright/test';

test.describe('visual regression', () => {
  test('home page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Mawimbi');
    await expect(page).toHaveScreenshot('home.png');
  });

  test('project page - empty', async ({ page }) => {
    await page.goto('/project');
    await page.waitForSelector('text=Upload');
    await expect(page).toHaveScreenshot('project-empty.png');
  });

  test('project page - header', async ({ page }) => {
    await page.goto('/project');
    const header = page.locator('.page__header');
    await expect(header).toBeVisible();
    await expect(header).toHaveScreenshot('project-header.png');
  });

  test('project page - toolbar', async ({ page }) => {
    await page.goto('/project');
    const toolbar = page.locator('.toolbar');
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toHaveScreenshot('toolbar.png');
  });
});

test.describe('dark theme properties', () => {
  test('body has dark background', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Mawimbi');
    const bgColor = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    // Body should have an explicit dark background, not the browser default transparent
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('body has light text color', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Mawimbi');
    const color = await page.evaluate(
      () => window.getComputedStyle(document.body).color,
    );
    // Text should be light on a dark background, not the browser default black
    expect(color).not.toBe('rgb(0, 0, 0)');
  });

  test('toolbar buttons use custom white color, not antd link blue', async ({
    page,
  }) => {
    await page.goto('/project');
    const button = page.locator('.toolbar .button').first();
    await expect(button).toBeVisible();
    const color = await button.evaluate(
      (el) => window.getComputedStyle(el).color,
    );
    // Buttons should use custom white-ish color, not antd default link blue
    expect(color).not.toBe('rgb(22, 104, 220)');
  });

  test('header has zero padding', async ({ page }) => {
    await page.goto('/project');
    const header = page.locator('.page__header');
    await expect(header).toBeVisible();
    const padding = await header.evaluate(
      (el) => window.getComputedStyle(el).padding,
    );
    // Header padding should be overridden to 0, not antd default 0 50px
    expect(padding).toBe('0px');
  });

  test('project page header inner container has correct padding', async ({
    page,
  }) => {
    await page.goto('/project');
    const headerInner = page.locator('.project-page-header');
    await expect(headerInner).toBeVisible();
    const padding = await headerInner.evaluate(
      (el) => window.getComputedStyle(el).padding,
    );
    // Inner header container should have 16px 24px padding matching antd v4 PageHeader default
    expect(padding).toBe('16px 24px');
  });

  test('project page header title has correct font size', async ({ page }) => {
    await page.goto('/project');
    const title = page.locator('.project-page-header__title');
    await expect(title).toBeVisible();
    const fontSize = await title.evaluate(
      (el) => window.getComputedStyle(el).fontSize,
    );
    // Title should be 20px (antd h4 / Typography.Title level={4}), matching antd v4 PageHeader title
    expect(fontSize).toBe('20px');
  });
});
