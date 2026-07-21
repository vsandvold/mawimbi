import { expect, test, uploadAudioFile, SHORT_AUDIO } from './fixtures';

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

// Spec 004 M5: effect settings are project state — they must survive a
// reload the same way the track itself does.
test.describe('Effect settings persistence across page reload (spec 004)', () => {
  const DRAWER_ANIMATION_MS = 350;
  const CONTENT_SETTLE_WAIT_MS = 500;
  const AUTO_SAVE_WAIT_MS = 500;
  // Comfortably larger than Radix Slider's drag-activation threshold.
  const SLIDER_DRAG_DELTA_PX = 60;
  // Stepped, frame-paced movement (established pattern, mixer-focus.spec.ts).
  const DRAG_STEPS = 8;
  const FRAME_MS = 16;

  async function openEffectsDrawer(page: import('@playwright/test').Page) {
    await page.getByTitle('Show effects').click();
    await page.waitForTimeout(DRAWER_ANIMATION_MS);
  }

  function spaceSliderThumb(page: import('@playwright/test').Page) {
    return page.getByRole('slider', { name: 'Space amount' });
  }

  test('setting an effect amount survives a reload; the drawer shows the restored amount', async ({
    page,
  }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(1);
    await page.waitForTimeout(CONTENT_SETTLE_WAIT_MS);

    await openEffectsDrawer(page);

    const thumb = spaceSliderThumb(page);
    const box = (await thumb.boundingBox())!;
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= DRAG_STEPS; i++) {
      await page.mouse.move(
        startX + (SLIDER_DRAG_DELTA_PX * i) / DRAG_STEPS,
        startY,
      );
      await page.waitForTimeout(FRAME_MS);
    }
    await page.mouse.up();

    const committedValue = await thumb.getAttribute('aria-valuenow');
    expect(Number(committedValue)).toBeGreaterThan(0);

    await page.waitForTimeout(AUTO_SAVE_WAIT_MS);
    await page.reload();
    await expect(page.locator('.timeline__track')).toBeVisible({
      timeout: 10_000,
    });

    await openEffectsDrawer(page);

    await expect(spaceSliderThumb(page)).toHaveAttribute(
      'aria-valuenow',
      committedValue!,
    );
  });
});
