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

  test('drawer opens from the mic button and closes via its own close control', async ({
    page,
  }) => {
    await page.getByTitle('Show recording').click();

    const drawer = page.getByText('Recording', { exact: true });
    await expect(drawer).toBeVisible();

    await page.getByTitle('Close').click();

    await expect(drawer).not.toBeVisible();
  });

  test('other sheet toggles are inert while counting in and recording', async ({
    page,
  }) => {
    // A backing track first, so Lyrics/Mixer/Effects are only disabled by
    // the recording lock below — otherwise they'd already be disabled by
    // the empty-project guard and the assertions would prove nothing.
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    await page.getByTitle('Show recording').click();
    await page.getByTitle('Record', { exact: true }).click();

    // Counting in: every other sheet toggle is disabled, including the
    // recording drawer's own toggle and close control (drawer stays open
    // through count-in and recording — spec 005 Decision 5).
    await expect(page.locator('.count-in')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTitle('Hide recording')).toBeDisabled();
    await expect(page.getByTitle('Show lyrics')).toBeDisabled();
    await expect(page.getByTitle('Close')).not.toBeVisible();

    await expect(page.locator('.count-in')).not.toBeVisible({
      timeout: 5000,
    });

    // Still locked once active recording starts.
    await expect(page.getByTitle('Hide recording')).toBeDisabled();
    await expect(page.getByTitle('Show lyrics')).toBeDisabled();
    await expect(page.getByTitle('Close')).not.toBeVisible();

    await page.getByTitle('Stop').click();
    await expect(page.locator('.timeline__track')).toHaveCount(2, {
      timeout: 5000,
    });

    // Idle again: toggles and the drawer's own close control are reachable.
    await expect(page.getByTitle('Hide recording')).toBeEnabled();
    await expect(page.getByTitle('Show lyrics')).toBeEnabled();
    await expect(page.getByTitle('Close')).toBeVisible();
  });

  test('monitoring: toggle + slider present, enabling warns, cancelling recording keeps monitoring inert without erroring', async ({
    page,
  }) => {
    await page.getByTitle('Show recording').click();

    const monitorToggle = page.getByTitle('Enable monitoring');
    await expect(monitorToggle).toBeVisible();
    await expect(
      page.getByRole('slider', { name: 'Monitor volume' }),
    ).toBeVisible();

    await monitorToggle.click();

    await expect(
      page.getByText('Monitoring enabled — watch for feedback'),
    ).toBeVisible();
    await expect(page.getByTitle('Disable monitoring')).toBeVisible();

    // Toggle + slider stay present through count-in/recording too (the
    // drawer's own controls, per spec 005 Decision 3/5).
    await page.getByTitle('Record', { exact: true }).click();
    await expect(page.locator('.count-in')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTitle('Disable monitoring')).toBeVisible();
    await expect(
      page.getByRole('slider', { name: 'Monitor volume' }),
    ).toBeVisible();
    await page.getByTitle('Cancel').click();
  });

  test('monitoring defaults to off each session (no persistence)', async ({
    page,
  }) => {
    await page.getByTitle('Show recording').click();
    await page.getByTitle('Enable monitoring').click();
    await expect(page.getByTitle('Disable monitoring')).toBeVisible();

    await page.reload();
    await ensureAudioContextRunning(page);

    await page.getByTitle('Show recording').click();
    await expect(page.getByTitle('Enable monitoring')).toBeVisible();
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
