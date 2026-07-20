import {
  expect,
  test,
  uploadAudioFile,
  LONG_AUDIO,
  SHORT_AUDIO,
} from './fixtures';

/**
 * Mixer-driven timeline focus: touching a channel's fader or dragging a
 * channel to reorder lifts that track in the timeline (--foreground) and
 * dims the rest (--background); releasing always reverts. Releasing must
 * not depend on the slider's value having changed — the stuck-focus bug
 * this spec pins happened because unfocus only ran from Radix's
 * onValueCommit, which never fires for a press-and-release without
 * movement.
 */

// Time to wait after the mixer opens so its 300 ms slide-in transition has
// fully settled before interacting with channel controls.
const MIXER_ANIMATION_MS = 350;

test.describe('Mixer-driven timeline focus', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(1);
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(2);

    await page.getByTitle('Show mixer').click();
    await expect(page.locator('.channel')).toHaveCount(2);
    await page.waitForTimeout(MIXER_ANIMATION_MS);
  });

  test('pressing and releasing the fader thumb without moving clears the focus', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    // Mixer rows are reversed: first channel = newest track = last timeline track.
    const thumb = page
      .locator('.mixer__channel')
      .first()
      .locator('[data-slot="slider-thumb"]');
    const box = (await thumb.boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(tracks.last()).toHaveClass(/timeline__track--foreground/);
    await expect(tracks.first()).toHaveClass(/timeline__track--background/);

    await page.mouse.up();

    await expect(tracks.last()).not.toHaveClass(
      /timeline__track--foreground/,
    );
    await expect(tracks.first()).not.toHaveClass(
      /timeline__track--background/,
    );
  });

  test('dragging the fader and releasing clears the focus', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    const thumb = page
      .locator('.mixer__channel')
      .first()
      .locator('[data-slot="slider-thumb"]');
    const box = (await thumb.boundingBox())!;
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 40, startY, { steps: 5 });
    await expect(tracks.last()).toHaveClass(/timeline__track--foreground/);

    await page.mouse.up();

    await expect(tracks.last()).not.toHaveClass(
      /timeline__track--foreground/,
    );
    await expect(tracks.first()).not.toHaveClass(
      /timeline__track--background/,
    );
  });

  test('drag-reordering a channel lifts its track while dragging and reverts on drop', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    const handles = page.locator('.channel__move');
    const sourceBox = (await handles.first().boundingBox())!;
    const targetBox = (await handles.last().boundingBox())!;
    const startX = sourceBox.x + sourceBox.width / 2;
    const startY = sourceBox.y + sourceBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Small initial move activates @dnd-kit's PointerSensor; a few stepped
    // moves get the drag genuinely under way before asserting.
    await page.mouse.move(startX, startY + 5);
    await page.mouse.move(startX, startY + 20, { steps: 4 });

    // The dragged channel is the newest track = last timeline track.
    await expect(tracks.last()).toHaveClass(/timeline__track--foreground/);
    await expect(tracks.first()).toHaveClass(/timeline__track--background/);

    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();

    await expect(tracks.last()).not.toHaveClass(
      /timeline__track--foreground/,
    );
    await expect(tracks.first()).not.toHaveClass(
      /timeline__track--background/,
    );
  });
});
