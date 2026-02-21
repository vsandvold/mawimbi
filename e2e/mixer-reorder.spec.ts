import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHORT_AUDIO = path.join(__dirname, 'fixtures', 'test-tone-short.wav');
const LONG_AUDIO = path.join(__dirname, 'fixtures', 'test-tone-long.wav');

// Time to wait after the mixer opens so its 300 ms slide-in transition has
// fully settled before @dnd-kit measures droppable rects.
const MIXER_ANIMATION_MS = 350;

/**
 * Uploads an audio file via the hidden file input inside the Ant Design Upload component.
 */
async function uploadAudioFile(
  page: import('@playwright/test').Page,
  filePath: string,
) {
  const fileInput = page.locator('.project-page-header input[type="file"]');
  await fileInput.setInputFiles(filePath);
}

/**
 * Drags an element's centre to another element's centre using pointer events,
 * which is what @dnd-kit's PointerSensor requires.
 */
async function dragTo(
  page: import('@playwright/test').Page,
  source: import('@playwright/test').Locator,
  target: import('@playwright/test').Locator,
) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Element not visible');

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Move a tiny bit first to activate the PointerSensor
  await page.mouse.move(startX, startY + 5);
  // Then move to the target in steps to trigger collision detection
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
}

test.describe('Mixer channel reordering', () => {
  test.beforeEach(async ({ page }) => {
    // Pin Math.random so track colours are deterministic across runs.
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
    await page.goto('/project');

    // Upload two tracks
    await uploadAudioFile(page, SHORT_AUDIO);
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__waveform')).toHaveCount(2);

    // Open the mixer and wait for the 300 ms slide-in animation to finish so
    // @dnd-kit can measure accurate droppable rects.
    await page.getByTitle('Show mixer').click();
    await expect(page.locator('.channel')).toHaveCount(2);
    await page.waitForTimeout(MIXER_ANIMATION_MS);
  });

  test('drag handle disables browser touch actions to prevent pointer cancel', async ({
    page,
  }) => {
    const handle = page.locator('.channel__move').first();
    const touchAction = await handle.evaluate(
      (el) => getComputedStyle(el).touchAction,
    );
    expect(touchAction).toBe('none');
  });

  test('dragging a channel downward reorders tracks in the mixer', async ({
    page,
  }) => {
    // With Math.random = () => 0, nextColorId starts at 0.
    // Track 1 (SHORT_AUDIO, added first):  COLOR_PALETTE[0] = rgb(77, 238, 234)
    // Track 2 (LONG_AUDIO, added second):  COLOR_PALETTE[1] = rgb(116, 238, 21)
    // Mixer shows tracks in reverse order, so Track 2 is first (top) and
    // Track 1 is second (bottom).
    const channels = page.locator('.channel');
    const colorBefore = await channels
      .first()
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);

    // Drag the top channel's handle down to the bottom channel's handle.
    const handles = page.locator('.channel__move');
    await dragTo(page, handles.first(), handles.last());

    // After dragging, the first channel should now have the other colour.
    await expect(async () => {
      const colorAfter = await channels
        .first()
        .evaluate((el) => (el as HTMLElement).style.backgroundColor);
      expect(colorAfter).not.toBe(colorBefore);
    }).toPass({ timeout: 2000 });
  });

  test('dragging a channel upward reorders tracks in the mixer', async ({
    page,
  }) => {
    const channels = page.locator('.channel');
    const colorBefore = await channels
      .first()
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);

    // Drag the bottom channel's handle up to the top channel's handle.
    const handles = page.locator('.channel__move');
    await dragTo(page, handles.last(), handles.first());

    // The top channel's colour should change because a different track is now
    // at that position.
    await expect(async () => {
      const colorAfter = await channels
        .first()
        .evaluate((el) => (el as HTMLElement).style.backgroundColor);
      expect(colorAfter).not.toBe(colorBefore);
    }).toPass({ timeout: 2000 });
  });
});
