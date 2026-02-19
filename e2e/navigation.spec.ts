import { expect, test } from '@playwright/test';

test.describe('Navigation', () => {
  test('shows a 404 message for unknown routes', async ({ page }) => {
    await page.goto('/unknown-route');
    await expect(page.getByText('/unknown-route')).toBeVisible();
  });

  test('home page is accessible at root path', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Mawimbi' })).toBeVisible();
  });

  test('project page is accessible at /project', async ({ page }) => {
    await page.goto('/project');
    await expect(page).toHaveURL('/project');
    await expect(
      page.getByText('Start recording, or upload some audio files')
    ).toBeVisible();
  });
});
