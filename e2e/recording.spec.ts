import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHORT_AUDIO = path.join(__dirname, 'fixtures', 'test-tone-short.wav');

// Chrome's --use-fake-device-for-media-stream provides a synthetic audio signal
// (beeping tone) from a virtual microphone. Combined with
// --use-fake-ui-for-media-stream, this auto-grants microphone permission
// without a user gesture, enabling headless recording tests.
// --autoplay-policy=no-user-gesture-required lets Tone.js AudioContext resume
// without requiring an explicit user gesture in the e2e environment.
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
  permissions: ['microphone'],
});

/**
 * Intercepts AudioContext construction so ensureAudioContextRunning() can
 * verify the context state after Tone.start(). Must be called before
 * page.goto() so the init script runs before the application creates its
 * AudioContext.
 */
async function installAudioContextSpy(
  page: import('@playwright/test').Page,
) {
  await page.addInitScript(() => {
    const captured: AudioContext[] = [];
    Object.defineProperty(window, '__audioContexts', { value: captured });
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        captured.push(this);
      }
    } as typeof AudioContext;
  });
}

/**
 * Ensures the Tone.js AudioContext is running before performing audio operations.
 *
 * AudioService.startAudio() installs a click handler on window that calls
 * Tone.start(). Clicking the toolbar area triggers this handler without
 * interfering with the dropzone file dialog on the editor area.
 *
 * After clicking, we poll the captured AudioContext state to confirm it
 * reached 'running'. This replaces a blind waitForTimeout(500) that could
 * mask a regression where the context stays 'suspended' (e.g. Tone.start()
 * removed, or the click listener never fires).
 *
 * Note: --autoplay-policy=no-user-gesture-required means Chrome may start
 * contexts in 'running' state automatically. The check still guards against
 * context creation failures or unexpected 'closed' / 'suspended' states.
 */
async function ensureAudioContextRunning(
  page: import('@playwright/test').Page,
) {
  await page.locator('.workstation__toolbar').click();

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const ctxs = (
            window as unknown as { __audioContexts: AudioContext[] }
          ).__audioContexts;
          if (!ctxs || ctxs.length === 0) return null;
          return ctxs[ctxs.length - 1].state;
        }),
      { message: 'AudioContext did not reach running state', timeout: 3000 },
    )
    .toBe('running');
}

/**
 * Records audio for the given duration by clicking the Record button
 * to start, waiting, then clicking again to stop.
 */
async function recordAudio(
  page: import('@playwright/test').Page,
  durationMs = 2000,
) {
  const recordButton = page.getByTitle('Record');

  await recordButton.click();
  await page.waitForTimeout(durationMs);
  await recordButton.click();

  // Wait for async track creation (decode + channel setup)
  await page.waitForTimeout(3000);
}

test.describe('Recording', () => {
  test.beforeEach(async ({ page }) => {
    await installAudioContextSpy(page);
    await page.goto('/project');
    await ensureAudioContextRunning(page);
  });

  test('recording creates a track in the timeline', async ({ page }) => {
    await recordAudio(page);

    const timelineTrack = page.locator('.timeline__track');
    await expect(timelineTrack).toBeVisible({ timeout: 5000 });
  });

  test('recorded track has a visible spectrogram', async ({
    page,
  }) => {
    await recordAudio(page);

    const timelineTrack = page.locator('.timeline__track');
    await expect(timelineTrack).toBeVisible({ timeout: 5000 });

    // The track should contain a spectrogram canvas
    const canvas = timelineTrack.locator('canvas');
    await expect(canvas.first()).toBeVisible({ timeout: 5000 });

    // Verify the canvas has non-empty content (data flowing through graph)
    const hasContent = await canvas.first().evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return false;
      const imageData = ctx.getImageData(0, 0, el.width, el.height);
      return imageData.data.some((value, i) => i % 4 === 3 && value > 0);
    });
    expect(hasContent).toBe(true);
  });

  test('recorded track can be played back', async ({ page }) => {
    await recordAudio(page);

    await expect(page.locator('.timeline__track')).toBeVisible({
      timeout: 5000,
    });

    const playButton = page.getByTitle('Play');
    await expect(playButton).toBeEnabled({ timeout: 5000 });

    await playButton.click();
    await expect(page.getByTitle('Pause')).toBeVisible();

    const reveal = page.locator('.scrubber__reveal');
    await expect(reveal).toHaveClass(/scrubber__reveal--active/);
  });

  test('recorded track plays from the beginning after recording stops', async ({
    page,
  }) => {
    await recordAudio(page);

    await expect(page.locator('.timeline__track')).toBeVisible({
      timeout: 5000,
    });

    // After recording stops, the transport should have been rewound to the
    // start. Verify the scrubber's scroll position is at the beginning.
    const scrollBefore = await page
      .locator('.scrubber__timeline')
      .evaluate((el) => el.scrollLeft);
    expect(scrollBefore).toBe(0);

    // Press play — playback should start from the beginning
    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();

    const reveal = page.locator('.scrubber__reveal');
    await expect(reveal).toHaveClass(/scrubber__reveal--active/);
  });
});

test.describe('Recording with existing tracks', () => {
  test.beforeEach(async ({ page }) => {
    await installAudioContextSpy(page);
    await page.goto('/project');
    await ensureAudioContextRunning(page);

    // Upload a backing track first
    const fileInput = page.locator('.project-page-header input[type="file"]');
    await fileInput.setInputFiles(SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();
  });

  test('overdub recording adds a second track alongside the uploaded track', async ({
    page,
  }) => {
    await recordAudio(page);

    await expect(page.locator('.timeline__track')).toHaveCount(2, {
      timeout: 5000,
    });
  });

  test('playback after overdub recording plays both tracks', async ({
    page,
  }) => {
    await recordAudio(page, 1500);

    await expect(page.locator('.timeline__track')).toHaveCount(2, {
      timeout: 5000,
    });

    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();

    const reveal = page.locator('.scrubber__reveal');
    await expect(reveal).toHaveClass(/scrubber__reveal--active/);
  });
});
