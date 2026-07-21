import { expect, test, uploadAudioFile, BURST_TAIL_AUDIO } from './fixtures';
import { meanLuminance } from './helpers/pixelDecode';

/**
 * Spectrogram refresh from the post-effect render (spec 004, milestone 6,
 * #494) — the "live-then-refine" contract: after a committed effect-amount
 * change, the track's tiles are re-rendered from a post-effect offline
 * render and re-analysed through the CQT pipeline, replacing the dry tiles.
 *
 * `test-burst-tail.wav` is a short decaying noise burst (0.15s) followed by
 * true digital silence to the file's 2.0s end — a known near-black dry
 * region for a reverb tail to fill in once Space is turned up.
 */

const CONTENT_SETTLE_WAIT_MS = 3000;
const DRAWER_ANIMATION_MS = 350;
// Matches workstationSignals.ts's DEFAULT_PIXELS_PER_SECOND (not exported).
const DEFAULT_PIXELS_PER_SECOND = 200;
// The burst decays to near-silence by ~0.15s; the window starts well after
// that so it only ever contains dry silence or reverb tail, never the
// burst's own onset energy. Kept short (not out to the file's 2.0s end):
// at the default zoom only ~0.8s of elapsed time renders above the
// playhead line before the runway's canvas window stops drawing content,
// so a wider window would sample empty (non-runway) background instead.
const DRY_WINDOW_START_SEC = 0.25;
const DRY_WINDOW_END_SEC = 0.65;
// Comfortably above any dry-silence noise floor, comfortably below the
// luminance a reverb tail actually produces (tuned against a real run:
// dry ≈0.7, Space=100 tail ≈7 in this window).
const TAIL_ENERGY_MARGIN = 3;

async function openEffectsDrawer(page: import('@playwright/test').Page) {
  await page.getByTitle('Show effects').click();
  await page.waitForTimeout(DRAWER_ANIMATION_MS);
}

async function rewindToStart(page: import('@playwright/test').Page) {
  await page.locator('.floating-toolbar').getByTitle('Rewind').click();
}

async function dryWindowClip(page: import('@playwright/test').Page) {
  const playheadLineY = await page
    .locator('.scrubber__playhead')
    .evaluate((el) => el.getBoundingClientRect().bottom);
  const viewportWidth = page.viewportSize()?.width ?? 0;

  return {
    x: 0,
    y: Math.round(
      playheadLineY - DRY_WINDOW_END_SEC * DEFAULT_PIXELS_PER_SECOND,
    ),
    width: viewportWidth,
    height: Math.round(
      (DRY_WINDOW_END_SEC - DRY_WINDOW_START_SEC) * DEFAULT_PIXELS_PER_SECOND,
    ),
  };
}

test.describe('Spectrogram refresh from the post-effect render', () => {
  test.beforeEach(async ({ page }) => {
    // Flattens the tilt (scale(s) = 1 everywhere) so elapsed time maps
    // linearly to on-screen Y (kb/verification.md, "isolating one track's
    // pixels" pattern) — the runway's real nonlinear projection would
    // otherwise make the elapsed→pixel offset above inexact.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/project/test-id');
    await uploadAudioFile(page, BURST_TAIL_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(1);
    await page.waitForTimeout(CONTENT_SETTLE_WAIT_MS);
    await rewindToStart(page);
  });

  test('turning Space up fills the dry region with tail energy; turning it back down restores near-black', async ({
    page,
  }) => {
    // Measured after the drawer opens, not before: opening it resolves new
    // runway geometry (drawer height changed), which shifts the playhead
    // line — a baseline captured pre-drawer isn't comparable to the
    // post-drawer polls below (same pitfall track-edit-mode.spec.ts's
    // dimming assertion documents).
    await openEffectsDrawer(page);
    const dryLuminance = await meanLuminance(page, await dryWindowClip(page));

    const spaceThumb = page.getByRole('slider', { name: 'Space amount' });
    await spaceThumb.focus();
    await spaceThumb.press('End');
    await expect(spaceThumb).toHaveAttribute('aria-valuenow', '100');

    await expect(async () => {
      const luminance = await meanLuminance(page, await dryWindowClip(page));
      expect(luminance).toBeGreaterThan(dryLuminance + TAIL_ENERGY_MARGIN);
    }).toPass({ timeout: 15_000 });

    await spaceThumb.focus();
    await spaceThumb.press('Home');
    await expect(spaceThumb).toHaveAttribute('aria-valuenow', '0');

    await expect(async () => {
      const luminance = await meanLuminance(page, await dryWindowClip(page));
      expect(luminance).toBeLessThan(dryLuminance + TAIL_ENERGY_MARGIN);
    }).toPass({ timeout: 15_000 });
  });
});
