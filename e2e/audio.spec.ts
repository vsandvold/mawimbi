import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from './fixtures';

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
  const fileInput = page.locator('.toolbar input[type="file"]');
  await fileInput.setInputFiles(filePath);
}

test.describe('Audio file upload', () => {
  test('uploads audio files, displays tracks, and enables controls', async ({
    page,
  }) => {
    await page.goto('/project/test-id');

    // Buttons start disabled
    await expect(page.getByTitle('Play')).toBeDisabled();
    await expect(page.getByTitle('Show mixer')).toBeDisabled();

    await uploadAudioFile(page, SHORT_AUDIO);

    // The empty state message should disappear and track appears
    await expect(
      page.getByText('Start recording, or upload some audio files'),
    ).toBeHidden();
    await expect(page.locator('.timeline__track')).toHaveCount(1);

    // Buttons become enabled
    await expect(page.getByTitle('Play')).toBeEnabled();
    await expect(page.getByTitle('Show mixer')).toBeEnabled();

    // Upload a second file
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(2);
  });
});

test.describe('Playback controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();
  });

  test('toggles playback via click and spacebar, shows playhead', async ({
    page,
  }) => {
    // Playhead is visible
    await expect(page.locator('.plasma-playhead')).toBeVisible();

    // Click play/pause
    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();
    await page.getByTitle('Pause').click();
    await expect(page.getByTitle('Play')).toBeVisible();

    // Spacebar play/pause
    await page.keyboard.press('Space');
    await expect(page.getByTitle('Pause')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByTitle('Play')).toBeVisible();
  });

  test('synced Players produce audio when Transport starts', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const connections: Array<{ src: string; dst: string }> = [];
      const origConnect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (
        ...args: Parameters<typeof origConnect>
      ) {
        const dst = args[0];
        connections.push({
          src: this.constructor.name,
          dst: dst instanceof AudioNode ? dst.constructor.name : 'AudioParam',
        });
        return origConnect.apply(
          this,
          args as unknown as Parameters<typeof origConnect>,
        );
      } as typeof origConnect;

      (window as unknown as Record<string, unknown>).__audioConnections =
        connections;
    });

    // Re-navigate so the init script takes effect
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    const prePlaybackCount = await page.evaluate(() => {
      const connections = (
        window as unknown as Record<
          string,
          Array<{ src: string; dst: string }>
        >
      ).__audioConnections;
      return connections.filter(
        (c) => c.src === 'AudioBufferSourceNode' && c.dst === 'GainNode',
      ).length;
    });

    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();
    await page.waitForTimeout(500);

    const postPlaybackCount = await page.evaluate(() => {
      const connections = (
        window as unknown as Record<
          string,
          Array<{ src: string; dst: string }>
        >
      ).__audioConnections;
      return connections.filter(
        (c) => c.src === 'AudioBufferSourceNode' && c.dst === 'GainNode',
      ).length;
    });

    expect(postPlaybackCount - prePlaybackCount).toBeGreaterThan(0);
  });
});

test.describe('Mixer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();
  });

  test('opens mixer with channel controls, adds channels per track, closes', async ({
    page,
  }) => {
    const bottomSheet = page.locator('.bottom-sheet');
    await expect(bottomSheet).toHaveCount(0);

    // Open mixer
    await page.getByTitle('Show mixer').click();
    await expect(bottomSheet).toBeVisible();

    // One track → one channel with controls
    const channels = page.locator('.channel');
    await expect(channels).toHaveCount(1);
    await expect(page.getByTitle('On')).toBeVisible();
    await expect(page.getByTitle('Move')).toBeVisible();

    // Upload second track → two channels
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(channels).toHaveCount(2);

    // Close via the close button
    await bottomSheet.getByTitle('Close').click();
    await expect(bottomSheet).toHaveCount(0);
  });

  test('mute/solo button cycles through on, mute, solo states', async ({
    page,
  }) => {
    await page.getByTitle('Show mixer').click();

    const track = page.locator('.timeline__track');

    // on → solo
    await page.getByTitle('On').click();
    await expect(track).not.toHaveClass(/timeline__track--muted/);
    await expect(page.getByTitle('Solo')).toBeVisible();

    // solo → mute
    await page.getByTitle('Solo').click();
    await expect(track).toHaveClass(/timeline__track--muted/);
    await expect(page.getByTitle('Muted')).toBeVisible();

    // mute → on
    await page.getByTitle('Muted').click();
    await expect(page.getByTitle('On')).toBeVisible();
  });

  test('solo mutes other tracks', async ({ page }) => {
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(2);

    await page.getByTitle('Show mixer').click();

    const channelButtons = page.getByTitle('On');
    await channelButtons.first().click(); // on → solo

    await expect(page.locator('.timeline__track--muted')).toHaveCount(1);
    await expect(page.locator('.timeline__track')).toHaveCount(2);
  });
});

test.describe('Spectrogram rendering', () => {
  test('renders canvas per track with correct opacity', async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);

    const timeline = page.locator('.timeline');
    await expect(timeline).toBeVisible();
    await expect(timeline.locator('canvas').first()).toBeVisible();

    // Full volume → opacity should be close to 1
    const timelineTrack = page.locator('.timeline__track').first();
    const innerDiv = timelineTrack.locator('> div').first();
    const opacity = await innerDiv.evaluate(
      (el) => window.getComputedStyle(el).opacity,
    );
    expect(parseFloat(opacity)).toBeCloseTo(1.0, 1);

    // Upload second track — each gets its own canvas
    await uploadAudioFile(page, LONG_AUDIO);
    const tracks = page.locator('.timeline__track');
    await expect(tracks).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await expect(tracks.nth(i).locator('canvas').first()).toBeVisible();
    }
  });
});

test.describe('Floating toolbar', () => {
  test('rewind button rewinds playback', async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    const rewindButton = page.locator('.floating-toolbar').getByTitle('Rewind');
    await expect(rewindButton).toBeVisible();
    await rewindButton.click();
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

  test('timeline, toolbar playing, and mixer screenshots', async ({
    page,
  }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);

    const timeline = page.locator('.timeline');
    await expect(timeline.locator('canvas').first()).toBeVisible();

    // Single track timeline
    await expect(page.locator('.editor')).toHaveScreenshot(
      'timeline-single-track.png',
    );

    // Toolbar while playing
    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();
    await expect(page.locator('.workstation__toolbar')).toHaveScreenshot(
      'toolbar-playing.png',
    );
    await page.getByTitle('Pause').click();

    // Mixer with one channel
    await page.getByTitle('Show mixer').click();
    await expect(page.locator('.channel')).toBeVisible();
    await expect(page.locator('.bottom-sheet')).toHaveScreenshot(
      'mixer-one-channel.png',
    );

    // Muted channel
    await page.getByTitle('On').click(); // on → solo
    await page.getByTitle('Solo').click(); // solo → mute
    await expect(page.locator('.timeline__track--muted')).toBeVisible();
    await expect(page.locator('.workstation')).toHaveScreenshot(
      'timeline-muted-track.png',
    );
  });

  test('two tracks timeline and solo channel', async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await uploadAudioFile(page, LONG_AUDIO);

    await expect(page.locator('.timeline__track')).toHaveCount(2);
    await expect(
      page.locator('.timeline').locator('canvas').first(),
    ).toBeVisible();

    // Two tracks timeline
    await expect(page.locator('.editor')).toHaveScreenshot(
      'timeline-two-tracks.png',
    );

    // Solo channel
    await page.getByTitle('Show mixer').click();
    const channelButtons = page.getByTitle('On');
    await channelButtons.first().click(); // on → solo
    await expect(page.locator('.timeline__track--muted')).toHaveCount(1);
    await expect(page.locator('.workstation')).toHaveScreenshot(
      'timeline-solo-track.png',
    );
  });

  test('scrubber scrolled forward', async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    const timeline = page.locator('.scrubber__timeline');
    await timeline.evaluate((el) => {
      el.scrollTop = 200;
    });
    await page.waitForTimeout(400);

    await expect(page.locator('.editor')).toHaveScreenshot(
      'scrubber-scrolled-forward.png',
    );
  });
});
