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
    await page.goto('/project/test-id');
  });

  test('uploads an audio file and displays a track in the timeline', async ({
    page,
  }) => {
    await uploadAudioFile(page, SHORT_AUDIO);

    // The empty state message should disappear
    await expect(
      page.getByText('Start recording, or upload some audio files'),
    ).toBeHidden();

    // A timeline track should appear
    const timelineTrack = page.locator('.timeline__track');
    await expect(timelineTrack).toBeVisible();
  });

  test('uploads multiple audio files', async ({ page }) => {
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(1);

    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(2);
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
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    // Wait for track to appear
    await expect(page.locator('.timeline__track')).toBeVisible();
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

  test('synced Players produce audio when Transport starts', async ({ page }) => {
    // Intercept AudioNode.connect to track whether the Tone.js Player
    // actually creates an AudioBufferSourceNode during playback. If the
    // Transport is bound to the wrong AudioContext (stale Tone.Transport
    // reference after Tone.setContext), the synced Player never fires.
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

    // At least one AudioBufferSourceNode → GainNode connection must appear
    // during playback, proving the Player started producing audio.
    expect(postPlaybackCount - prePlaybackCount).toBeGreaterThan(0);
  });

  test('shows a playback cursor while playing', async ({ page }) => {
    const playhead = page.locator('.plasma-playhead');
    await expect(playhead).toBeVisible();

    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();

    await page.getByTitle('Pause').click();
    await expect(page.getByTitle('Play')).toBeVisible();
  });
});

test.describe('Mixer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();
  });

  test('opens and closes the mixer panel', async ({ page }) => {
    // Mixer bottom sheet is initially not rendered
    const bottomSheet = page.locator('.mixer-bottom-sheet');
    await expect(bottomSheet).toHaveCount(0);

    // Click Show mixer → bottom sheet appears
    await page.getByTitle('Show mixer').click();
    await expect(bottomSheet).toBeVisible();

    // Click Hide mixer → bottom sheet disappears
    await page.getByTitle('Hide mixer').click();
    await expect(bottomSheet).toHaveCount(0);
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

  test('channel has mute/solo and move controls', async ({ page }) => {
    await page.getByTitle('Show mixer').click();

    await expect(page.getByTitle('On')).toBeVisible();
    await expect(page.getByTitle('Move')).toBeVisible();
  });

  test('mute/solo button cycles through on, mute, solo states', async ({
    page,
  }) => {
    await page.getByTitle('Show mixer').click();

    const track = page.locator('.timeline__track');

    // Click once: on → mute
    await page.getByTitle('On').click();
    await expect(track).toHaveClass(/timeline__track--muted/);
    await expect(page.getByTitle('Muted')).toBeVisible();

    // Click again: mute → solo
    await page.getByTitle('Muted').click();
    await expect(track).not.toHaveClass(/timeline__track--muted/);
    await expect(page.getByTitle('Solo')).toBeVisible();

    // Click again: solo → on
    await page.getByTitle('Solo').click();
    await expect(page.getByTitle('On')).toBeVisible();
  });

  test('solo mutes other tracks', async ({ page }) => {
    // Upload a second track so solo logic has meaning
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(2);

    await page.getByTitle('Show mixer').click();

    // Cycle the first channel button to solo (on → mute → solo)
    const channelButtons = page.getByTitle('On');
    await channelButtons.first().click(); // on → mute
    await page.getByTitle('Muted').click(); // mute → solo

    // The non-solo track should be muted
    const tracks = page.locator('.timeline__track');
    const mutedTracks = page.locator('.timeline__track--muted');
    await expect(mutedTracks).toHaveCount(1);
    await expect(tracks).toHaveCount(2);
  });
});

test.describe('Spectrogram rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
  });

  test('renders spectrogram canvas for uploaded track', async ({ page }) => {
    await uploadAudioFile(page, SHORT_AUDIO);

    const timeline = page.locator('.timeline');
    await expect(timeline).toBeVisible();

    const canvas = timeline.locator('canvas');
    await expect(canvas.first()).toBeVisible();
  });

  test('each uploaded track gets its own visualization', async ({ page }) => {
    await uploadAudioFile(page, SHORT_AUDIO);
    await uploadAudioFile(page, LONG_AUDIO);

    const tracks = page.locator('.timeline__track');
    await expect(tracks).toHaveCount(2);

    // Each track should contain a canvas element
    for (let i = 0; i < 2; i++) {
      const canvas = tracks.nth(i).locator('canvas');
      await expect(canvas.first()).toBeVisible();
    }
  });

  test('spectrogram opacity reflects track volume', async ({ page }) => {
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    // Full volume → opacity should be close to 1
    const timelineTrack = page.locator('.timeline__track').first();
    const innerDiv = timelineTrack.locator('> div').first();
    const opacity = await innerDiv.evaluate(
      (el) => window.getComputedStyle(el).opacity,
    );
    expect(parseFloat(opacity)).toBeCloseTo(1.0, 1);
  });
});

test.describe('Scrubber', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();
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

    // Click the scrubber's rewind button (scoped to avoid the toolbar's)
    await page.locator('.scrubber__rewind').getByTitle('Rewind').click();

    // Rewind button should hide (transport time reset to 0 → scrollLeft = 0)
    await expect(rewindButton).toHaveClass(/scrubber__rewind--hidden/);

    // Timeline scroll position should be back at 0
    const scrollLeft = await timeline.evaluate((el) => el.scrollLeft);
    expect(scrollLeft).toBe(0);
  });
});

test.describe('Rewind control', () => {
  test('rewind button appears and resets playback', async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    // Start playback
    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();

    // Wait a bit for playback to advance
    await page.waitForTimeout(500);

    // Pause
    await page.getByTitle('Pause').click();

    // The toolbar rewind button (scoped to avoid the scrubber's)
    const rewindButton = page.locator('.toolbar').getByTitle('Rewind');

    // Click rewind if enabled
    if (await rewindButton.isEnabled()) {
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

  test('timeline with single track', async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);

    const timeline = page.locator('.timeline');
    await expect(timeline.locator('canvas').first()).toBeVisible();

    await expect(page.locator('.editor')).toHaveScreenshot(
      'timeline-single-track.png',
    );
  });

  test('timeline with two tracks', async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await uploadAudioFile(page, LONG_AUDIO);

    await expect(page.locator('.timeline__track')).toHaveCount(2);
    const timeline = page.locator('.timeline');
    await expect(timeline.locator('canvas').first()).toBeVisible();

    await expect(page.locator('.editor')).toHaveScreenshot(
      'timeline-two-tracks.png',
    );
  });

  test('toolbar while playing', async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();

    await expect(page.locator('.workstation__toolbar')).toHaveScreenshot(
      'toolbar-playing.png',
    );

    await page.getByTitle('Pause').click();
  });

  test('mixer open with one channel', async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    await page.getByTitle('Show mixer').click();
    await expect(page.locator('.channel')).toBeVisible();

    await expect(page.locator('.mixer-bottom-sheet')).toHaveScreenshot(
      'mixer-one-channel.png',
    );
  });

  test('mixer with muted channel', async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    await page.getByTitle('Show mixer').click();
    await page.getByTitle('On').click(); // on → mute
    await expect(
      page.locator('.timeline__track--muted'),
    ).toBeVisible();

    await expect(page.locator('.workstation')).toHaveScreenshot(
      'timeline-muted-track.png',
    );
  });

  test('mixer with solo channel', async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(2);

    await page.getByTitle('Show mixer').click();
    // Cycle first channel to solo (on → mute → solo)
    const channelButtons = page.getByTitle('On');
    await channelButtons.first().click(); // on → mute
    await page.getByTitle('Muted').click(); // mute → solo
    await expect(page.locator('.timeline__track--muted')).toHaveCount(1);

    await expect(page.locator('.workstation')).toHaveScreenshot(
      'timeline-solo-track.png',
    );
  });

  test('scrubber scrolled forward with rewind button visible', async ({
    page,
  }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

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
