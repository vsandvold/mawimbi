import { expect, test } from '@playwright/test';

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays the Mawimbi title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Mawimbi' })).toBeVisible();
  });

  test('displays the Create Project button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Create Project' })
    ).toBeVisible();
  });

  test('navigates to the project page when Create Project is clicked', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page).toHaveURL('/project');
  });
});
