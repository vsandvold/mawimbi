import { expect, test, uploadAudioFile, SHORT_AUDIO } from './fixtures';

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
  await page.locator('.toolbar-dock').click();

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
 * to start, waiting for the count-in to finish, recording for the
 * specified duration, then clicking again to stop.
 */
async function recordAudio(
  page: import('@playwright/test').Page,
  {
    durationMs = 1000,
    expectedTrackCount = 1,
  }: { durationMs?: number; expectedTrackCount?: number } = {},
) {
  const recordButton = page.getByTitle('Record');

  await recordButton.click();

  // Wait for the count-in overlay to appear, then disappear.
  // The count-in runs ~2 s (mic preparation + 4 beats × 500 ms).
  const countIn = page.locator('.count-in');
  await expect(countIn).toBeVisible({ timeout: 5000 });
  await expect(countIn).not.toBeVisible({ timeout: 5000 });

  await page.waitForTimeout(durationMs);
  await recordButton.click();

  // Wait for async track creation (decode + channel setup) by polling
  // for the expected number of tracks in the DOM.
  await expect(page.locator('.timeline__track')).toHaveCount(
    expectedTrackCount,
    { timeout: 5000 },
  );
}

test.describe('Recording', () => {
  test.beforeEach(async ({ page }) => {
    await installAudioContextSpy(page);
    await page.goto('/project/test-id');
    await ensureAudioContextRunning(page);
  });

  test('recording creates track with spectrogram, rewinds, and plays back', async ({
    page,
  }) => {
    await recordAudio(page);

    const timelineTrack = page.locator('.timeline__track');
    await expect(timelineTrack).toBeVisible({ timeout: 5000 });

    // Track has a visible spectrogram canvas with content
    const canvas = timelineTrack.locator('canvas');
    await expect(canvas.first()).toBeVisible({ timeout: 5000 });
    await expect(async () => {
      const hasContent = await canvas
        .first()
        .evaluate((el: HTMLCanvasElement) => {
          const ctx = el.getContext('2d');
          if (!ctx) return false;
          const imageData = ctx.getImageData(0, 0, el.width, el.height);
          return imageData.data.some((value, i) => i % 4 === 3 && value > 0);
        });
      expect(hasContent).toBe(true);
    }).toPass({ timeout: 5000 });

    // Transport is rewound to the start after recording stops
    const scrollBefore = await page
      .locator('.scrubber__timeline')
      .evaluate((el) => el.scrollTop);
    expect(scrollBefore).toBe(0);

    // Recorded track can be played back
    const playButton = page.getByTitle('Play');
    await expect(playButton).toBeEnabled({ timeout: 5000 });
    await playButton.click();
    await expect(page.getByTitle('Pause')).toBeVisible();
  });
});

test.describe('Recording with existing tracks', () => {
  test('overdub recording adds track and both can play back', async ({
    page,
  }) => {
    await installAudioContextSpy(page);
    await page.goto('/project/test-id');
    await ensureAudioContextRunning(page);

    // Upload a backing track first
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    await recordAudio(page, {
      durationMs: 1500,
      expectedTrackCount: 2,
    });

    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();
  });
});
