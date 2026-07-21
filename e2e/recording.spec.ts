import { expect, test, uploadAudioFile, SHORT_AUDIO } from './fixtures';
import {
  installAudioContextSpy,
  ensureAudioContextRunning,
  recordAudio,
} from './helpers/recording';

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

    // Transport is rewound to the start after recording stops.
    // With inverted scroll, time=0 maps to scrollTop = maxScrollTop.
    const { scrollTop, maxScrollTop } = await page
      .locator('.scrubber__phantom')
      .evaluate((el) => ({
        scrollTop: el.scrollTop,
        maxScrollTop: el.scrollHeight - el.clientHeight,
      }));
    expect(scrollTop).toBe(maxScrollTop);

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
