import { expect, test } from '@playwright/test';

test.describe('Navigation', () => {
  test('shows a 404 message for unknown routes', async ({ page }) => {
    await page.goto('/unknown-route');
    await expect(page.getByText('/unknown-route')).toBeVisible();
  });

  test('routes resolve to correct pages', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: 'Mawimbi' }),
    ).toBeVisible();

    await page.goto('/project/test-id');
    await expect(page).toHaveURL('/project/test-id');
    await expect(
      page.getByText('Start recording, or upload some audio files'),
    ).toBeVisible();
  });
});
