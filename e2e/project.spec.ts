import { expect, test } from '@playwright/test';

test.describe('Project page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project');
  });

  test.describe('header', () => {
    test('displays a back button', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
    });

    test('back button navigates to the home page', async ({ page }) => {
      // Navigate from home so there is history to go back to
      await page.goto('/');
      await page.getByRole('button', { name: 'Create Project' }).click();
      await expect(page).toHaveURL('/project');
      await page.getByRole('button', { name: 'Back' }).click();
      await expect(page).toHaveURL('/');
    });

    test('displays an upload button', async ({ page }) => {
      await expect(page.getByText('Upload files')).toBeVisible();
    });

    test('displays an overflow menu button', async ({ page }) => {
      const overflowButton = page.locator('.overflow-button');
      await expect(overflowButton).toBeVisible();
    });
  });

  test.describe('empty timeline', () => {
    test('shows empty state message when no tracks are loaded', async ({
      page,
    }) => {
      await expect(
        page.getByText('Start recording, or upload some audio files')
      ).toBeVisible();
    });

    test('shows drop files instruction on desktop', async ({ page }) => {
      await expect(
        page.getByText('Drop files here, or use the upload button above')
      ).toBeVisible();
    });
  });

  test.describe('toolbar', () => {
    test('play button is disabled when no tracks are loaded', async ({
      page,
    }) => {
      const playButton = page.getByTitle('Play');
      await expect(playButton).toBeDisabled();
    });

    test('mixer button is disabled when no tracks are loaded', async ({
      page,
    }) => {
      const mixerButton = page.getByTitle('Show mixer');
      await expect(mixerButton).toBeDisabled();
    });

    test('record button is enabled when no tracks are loaded', async ({
      page,
    }) => {
      const recordButton = page.getByTitle('Record');
      await expect(recordButton).toBeEnabled();
    });
  });
});

test.describe('Project page overflow menu', () => {
  test('shows fullscreen option when overflow menu is opened', async ({
    page,
  }) => {
    await page.goto('/project');
    await page.locator('.overflow-button').click();
    await expect(page.getByText('Enter Full Screen')).toBeVisible();
  });
});
