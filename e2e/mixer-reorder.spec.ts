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
 * Drags an element's centre to another element's centre using mouse events.
 */
async function mouseDragTo(
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

const FRAME_MS = 16;

/**
 * Drags an element's centre to another element's centre using CDP touch
 * events, which generate pointer events with pointerType "touch" — the same
 * path a real finger follows on a touchscreen device.
 */
async function touchDragTo(
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

  const cdp = await page.context().newCDPSession(page);

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y: startY }],
  });
  await page.waitForTimeout(FRAME_MS);

  // Small initial move to activate the PointerSensor
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: startX, y: startY + 5 }],
  });
  await page.waitForTimeout(FRAME_MS);

  // Move to the target in steps to trigger collision detection
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const x = startX + (endX - startX) * (i / steps);
    const y = startY + (endY - startY) * (i / steps);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y }],
    });
    await page.waitForTimeout(FRAME_MS);
  }

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  await cdp.detach();
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

  test('touch-dragging a channel reorders tracks in the mixer', async ({
    browser,
  }) => {
    // touch-action: none on the drag handle prevents the browser from
    // firing pointercancel during a touch drag. Verify the CSS is applied
    // and that an actual touch drag reorders the channels.
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
    await page.goto('/project');

    // Dismiss the fullscreen overlay shown on touch-capable devices
    await page.getByText('Dismiss').click();

    await uploadAudioFile(page, SHORT_AUDIO);
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__waveform')).toHaveCount(2);

    await page.getByTitle('Show mixer').click();
    await expect(page.locator('.channel')).toHaveCount(2);
    await page.waitForTimeout(MIXER_ANIMATION_MS);

    // Verify touch-action CSS is applied to the drag handle
    const handle = page.locator('.channel__move').first();
    const touchAction = await handle.evaluate(
      (el) => getComputedStyle(el).touchAction,
    );
    expect(touchAction).toBe('none');

    const channels = page.locator('.channel');
    const colorBefore = await channels
      .first()
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);

    // Touch-drag the top channel's handle down to the bottom channel's handle
    const handles = page.locator('.channel__move');
    await touchDragTo(page, handles.first(), handles.last());

    // After dragging, the first channel should now have the other colour.
    await expect(async () => {
      const colorAfter = await channels
        .first()
        .evaluate((el) => (el as HTMLElement).style.backgroundColor);
      expect(colorAfter).not.toBe(colorBefore);
    }).toPass({ timeout: 2000 });

    await context.close();
  });

  test('mouse-dragging a channel reorders tracks in the mixer', async ({
    page,
  }) => {
    const channels = page.locator('.channel');
    const colorBefore = await channels
      .first()
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);

    // Drag the top channel's handle down to the bottom channel's handle.
    const handles = page.locator('.channel__move');
    await mouseDragTo(page, handles.first(), handles.last());

    // After dragging, the first channel should now have the other colour.
    await expect(async () => {
      const colorAfter = await channels
        .first()
        .evaluate((el) => (el as HTMLElement).style.backgroundColor);
      expect(colorAfter).not.toBe(colorBefore);
    }).toPass({ timeout: 2000 });
  });
});
