import { expect, test } from './fixtures';

test.describe('Project page', () => {
  test('header shows back button, upload button, and overflow menu', async ({
    page,
  }) => {
    await page.goto('/project/test-id');
    await expect(
      page.getByRole('link', { name: 'Back', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Upload files')).toBeVisible();
    await expect(page.locator('.overflow-button')).toBeVisible();
  });

  test('back button navigates to the home page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page).toHaveURL(
      /\/project\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL('/');
  });

  test('empty state shows messages and correct toolbar button states', async ({
    page,
  }) => {
    await page.goto('/project/test-id');
    await expect(
      page.getByText('Start recording, or upload some audio files'),
    ).toBeVisible();
    await expect(
      page.getByText('Drop files here, or use the upload button above'),
    ).toBeVisible();
    await expect(page.getByTitle('Play')).toBeDisabled();
    await expect(page.getByTitle('Show mixer')).toBeDisabled();
    await expect(page.getByTitle('Record')).toBeEnabled();
  });

  test('overflow menu shows fullscreen option', async ({ page }) => {
    await page.goto('/project/test-id');
    await page.locator('.overflow-button').click();
    await expect(page.getByText('Enter Full Screen')).toBeVisible();
  });
});
