import { expect, test } from './fixtures';

test.describe('Home page', () => {
  test('displays title and Create Project button, navigates to project', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Mawimbi' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create Project' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page).toHaveURL(
      /\/project\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
  });
});
