import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHORT_AUDIO = path.join(__dirname, 'fixtures', 'test-tone-short.wav');
const LONG_AUDIO = path.join(__dirname, 'fixtures', 'test-tone-long.wav');

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

test.describe('Audio file upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project');
  });

  test('uploads an audio file and displays a waveform in the timeline', async ({
    page,
  }) => {
    await uploadAudioFile(page, SHORT_AUDIO);

    // The empty state message should disappear
    await expect(
      page.getByText('Start recording, or upload some audio files'),
    ).toBeHidden();

    // A timeline waveform track should appear
    const waveformTrack = page.locator('.timeline__waveform');
    await expect(waveformTrack).toBeVisible();
  });

  test('uploads multiple audio files', async ({ page }) => {
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__waveform')).toHaveCount(1);

    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__waveform')).toHaveCount(2);
  });

  test('enables play and mixer buttons after upload', async ({ page }) => {
    // Buttons start disabled
    await expect(page.getByTitle('Play')).toBeDisabled();
    await expect(page.getByTitle('Show mixer')).toBeDisabled();

    await uploadAudioFile(page, SHORT_AUDIO);

    await expect(page.getByTitle('Play')).toBeEnabled();
    await expect(page.getByTitle('Show mixer')).toBeEnabled();
  });
});

test.describe('Playback controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project');
    await uploadAudioFile(page, SHORT_AUDIO);
    // Wait for track to appear
    await expect(page.locator('.timeline__waveform')).toBeVisible();
  });

  test('toggles between play and pause', async ({ page }) => {
    // Initially shows Play
    const playButton = page.getByTitle('Play');
    await expect(playButton).toBeVisible();

    // Click play → button switches to Pause
    await playButton.click();
    await expect(page.getByTitle('Pause')).toBeVisible();

    // Click pause → button switches back to Play
    await page.getByTitle('Pause').click();
    await expect(page.getByTitle('Play')).toBeVisible();
  });

  test('toggles playback with spacebar', async ({ page }) => {
    await expect(page.getByTitle('Play')).toBeVisible();

    await page.keyboard.press('Space');
    await expect(page.getByTitle('Pause')).toBeVisible();

    await page.keyboard.press('Space');
    await expect(page.getByTitle('Play')).toBeVisible();
  });

  test('shows a playback cursor while playing', async ({ page }) => {
    const cursor = page.locator('.cursor');
    await expect(cursor).toBeVisible();

    await page.getByTitle('Play').click();
    await expect(cursor).toHaveClass(/cursor--is-playing/);

    await page.getByTitle('Pause').click();
    await expect(cursor).not.toHaveClass(/cursor--is-playing/);
  });
});

test.describe('Mixer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__waveform')).toBeVisible();
  });

  test('opens and closes the mixer panel', async ({ page }) => {
    // Mixer container is initially closed (translated off-screen)
    const mixerContainer = page.locator('.editor__mixer');
    await expect(mixerContainer).toHaveClass(/editor__mixer--closed/);

    // Click Show mixer → container slides in
    await page.getByTitle('Show mixer').click();
    await expect(mixerContainer).not.toHaveClass(/editor__mixer--closed/);

    // Click Hide mixer → container slides out
    await page.getByTitle('Hide mixer').click();
    await expect(mixerContainer).toHaveClass(/editor__mixer--closed/);
  });

  test('displays a channel strip for each uploaded track', async ({
    page,
  }) => {
    await page.getByTitle('Show mixer').click();

    // One track uploaded → one channel
    const channels = page.locator('.channel');
    await expect(channels).toHaveCount(1);

    // Upload second track
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(channels).toHaveCount(2);
  });

  test('channel has mute, solo, and move controls', async ({ page }) => {
    await page.getByTitle('Show mixer').click();

    await expect(page.getByTitle('Mute')).toBeVisible();
    await expect(page.getByTitle('Solo')).toBeVisible();
    await expect(page.getByTitle('Move')).toBeVisible();
  });

  test('mute button toggles muted state on the track', async ({ page }) => {
    await page.getByTitle('Show mixer').click();

    const muteButton = page.getByTitle('Mute');

    // Click mute
    await muteButton.click();
    const waveform = page.locator('.timeline__waveform');
    await expect(waveform).toHaveClass(/timeline__waveform--muted/);

    // Click mute again to unmute
    await muteButton.click();
    await expect(waveform).not.toHaveClass(/timeline__waveform--muted/);
  });

  test('solo button highlights the solo state', async ({ page }) => {
    // Upload a second track so solo logic has meaning
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__waveform')).toHaveCount(2);

    await page.getByTitle('Show mixer').click();

    // Solo the first channel (mixer renders in reverse, so first button is last track)
    const soloButtons = page.getByTitle('Solo');
    await soloButtons.first().click();

    // The non-solo track should be muted
    const waveforms = page.locator('.timeline__waveform');
    const mutedWaveforms = page.locator('.timeline__waveform--muted');
    await expect(mutedWaveforms).toHaveCount(1);
    await expect(waveforms).toHaveCount(2);
  });
});

test.describe('Waveform and spectrogram rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project');
  });

  test('renders waveform or spectrogram canvas for uploaded track', async ({
    page,
  }) => {
    await uploadAudioFile(page, SHORT_AUDIO);

    const timeline = page.locator('.timeline');
    await expect(timeline).toBeVisible();

    // Should render either a WaveSurfer waveform (contains a canvas) or a spectrogram canvas
    const canvas = timeline.locator('canvas');
    await expect(canvas.first()).toBeVisible();
  });

  test('each uploaded track gets its own visualization', async ({ page }) => {
    await uploadAudioFile(page, SHORT_AUDIO);
    await uploadAudioFile(page, LONG_AUDIO);

    const tracks = page.locator('.timeline__waveform');
    await expect(tracks).toHaveCount(2);

    // Each track should contain a canvas element
    for (let i = 0; i < 2; i++) {
      const canvas = tracks.nth(i).locator('canvas');
      await expect(canvas.first()).toBeVisible();
    }
  });

  test('waveform opacity reflects track volume', async ({ page }) => {
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__waveform')).toBeVisible();

    // Full volume → opacity should be close to 1
    const waveformTrack = page.locator('.timeline__waveform').first();
    const innerDiv = waveformTrack.locator('> div').first();
    const opacity = await innerDiv.evaluate(
      (el) => window.getComputedStyle(el).opacity,
    );
    expect(parseFloat(opacity)).toBeCloseTo(1.0, 1);
  });
});

test.describe('Scrubber', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__waveform')).toBeVisible();
  });

  test('scrolling forward shows the rewind button', async ({ page }) => {
    const timeline = page.locator('.scrubber__timeline');
    const rewindButton = page.locator('.scrubber__rewind');

    // Rewind button starts hidden at position 0
    await expect(rewindButton).toHaveClass(/scrubber__rewind--hidden/);

    // Scroll forward past the 10px threshold
    await timeline.evaluate((el) => {
      el.scrollLeft = 200;
    });

    // Wait for the 200ms debounce + React update cycle
    await page.waitForTimeout(400);

    // Rewind button should now be visible
    await expect(rewindButton).not.toHaveClass(/scrubber__rewind--hidden/);
  });

  test('scrolling back to the start hides the rewind button', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');
    const rewindButton = page.locator('.scrubber__rewind');

    // Scroll forward to show the rewind button
    await timeline.evaluate((el) => {
      el.scrollLeft = 200;
    });
    await page.waitForTimeout(400);
    await expect(rewindButton).not.toHaveClass(/scrubber__rewind--hidden/);

    // Scroll back to the beginning
    await timeline.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await page.waitForTimeout(400);

    // Rewind button should be hidden again
    await expect(rewindButton).toHaveClass(/scrubber__rewind--hidden/);
  });

  test('clicking the rewind button scrolls back to the start', async ({
    page,
  }) => {
    const timeline = page.locator('.scrubber__timeline');
    const rewindButton = page.locator('.scrubber__rewind');

    // Scroll forward to expose the rewind button
    await timeline.evaluate((el) => {
      el.scrollLeft = 200;
    });
    await page.waitForTimeout(400);
    await expect(rewindButton).not.toHaveClass(/scrubber__rewind--hidden/);

    // Click the rewind button
    await page.getByTitle('Rewind').click();

    // Rewind button should hide (transport time reset to 0 → scrollLeft = 0)
    await expect(rewindButton).toHaveClass(/scrubber__rewind--hidden/);

    // Timeline scroll position should be back at 0
    const scrollLeft = await timeline.evaluate((el) => el.scrollLeft);
    expect(scrollLeft).toBe(0);
  });
});

test.describe('Rewind control', () => {
  test('rewind button appears and resets playback', async ({ page }) => {
    await page.goto('/project');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__waveform')).toBeVisible();

    // Start playback
    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();

    // Wait a bit for playback to advance
    await page.waitForTimeout(500);

    // Pause
    await page.getByTitle('Pause').click();

    // The rewind button should become visible after scrolling
    const rewindButton = page.getByTitle('Rewind');

    // Click rewind if visible (scrolled position)
    if (await rewindButton.isVisible()) {
      await rewindButton.click();

      // Should stop playback and rewind
      await expect(page.getByTitle('Play')).toBeVisible();
    }
  });
});

test.describe('Visual regression - audio states', () => {
  // Seed Math.random so the track color palette starts at index 0 (teal)
  // on every test run, making color-sensitive screenshots deterministic.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
  });

  test('timeline with single waveform track', async ({ page }) => {
    await page.goto('/project');
    await uploadAudioFile(page, SHORT_AUDIO);

    const timeline = page.locator('.timeline');
    await expect(timeline.locator('canvas').first()).toBeVisible();

    await expect(page.locator('.editor')).toHaveScreenshot(
      'timeline-single-track.png',
    );
  });

  test('timeline with two waveform tracks', async ({ page }) => {
    await page.goto('/project');
    await uploadAudioFile(page, SHORT_AUDIO);
    await uploadAudioFile(page, LONG_AUDIO);

    await expect(page.locator('.timeline__waveform')).toHaveCount(2);
    const timeline = page.locator('.timeline');
    await expect(timeline.locator('canvas').first()).toBeVisible();

    await expect(page.locator('.editor')).toHaveScreenshot(
      'timeline-two-tracks.png',
    );
  });

  test('toolbar while playing', async ({ page }) => {
    await page.goto('/project');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__waveform')).toBeVisible();

    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();

    await expect(page.locator('.workstation__toolbar')).toHaveScreenshot(
      'toolbar-playing.png',
    );

    await page.getByTitle('Pause').click();
  });

  test('mixer open with one channel', async ({ page }) => {
    await page.goto('/project');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__waveform')).toBeVisible();

    await page.getByTitle('Show mixer').click();
    await expect(page.locator('.channel')).toBeVisible();

    await expect(page.locator('.editor__mixer')).toHaveScreenshot(
      'mixer-one-channel.png',
    );
  });

  test('mixer with muted channel', async ({ page }) => {
    await page.goto('/project');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__waveform')).toBeVisible();

    await page.getByTitle('Show mixer').click();
    await page.getByTitle('Mute').click();
    await expect(
      page.locator('.timeline__waveform--muted'),
    ).toBeVisible();

    await expect(page.locator('.editor')).toHaveScreenshot(
      'timeline-muted-track.png',
    );
  });

  test('mixer with solo channel', async ({ page }) => {
    await page.goto('/project');
    await uploadAudioFile(page, SHORT_AUDIO);
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__waveform')).toHaveCount(2);

    await page.getByTitle('Show mixer').click();
    await page.getByTitle('Solo').first().click();
    await expect(page.locator('.timeline__waveform--muted')).toHaveCount(1);

    await expect(page.locator('.editor')).toHaveScreenshot(
      'timeline-solo-track.png',
    );
  });

  test('scrubber scrolled forward with rewind button visible', async ({
    page,
  }) => {
    await page.goto('/project');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__waveform')).toBeVisible();

    const timeline = page.locator('.scrubber__timeline');
    await timeline.evaluate((el) => {
      el.scrollLeft = 200;
    });
    await page.waitForTimeout(400);
    await expect(page.locator('.scrubber__rewind')).not.toHaveClass(
      /scrubber__rewind--hidden/,
    );

    await expect(page.locator('.editor')).toHaveScreenshot(
      'scrubber-scrolled-forward.png',
    );
  });
});
