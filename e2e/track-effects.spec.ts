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
// The raw burst is 0.15s, but its *CQT-rendered* energy smears well past
// that — low-frequency analysis kernels have a longer effective window
// (kb/domain.md, "CQT kernels are precomputed... capped at
// MAX_KERNEL_HOPS = 4"), so a broadband noise burst's visible tail in the
// spectrogram measured ~0.42s empirically (screenshot row-scan, decoded
// pixel-by-pixel), nearly 3x the raw audio duration. A window starting at
// 0.25s (the original value) sampled part of that smeared tail, not true
// silence, chronically flaky in CI (mawimbi#541 PR #550's build). 0.45s
// leaves a margin past the measured smear.
const DRY_WINDOW_START_SEC = 0.45;
const DRY_WINDOW_END_SEC = 0.75;
// The floating "back" button (`.floating-back-button`, top-left, ~42px)
// overlaps screen Y in this window at the default viewport width — clip
// starts after it so the window never samples UI chrome.
const CLIP_X_START_PX = 100;
// Repeated reads of an unchanged frame are bit-identical (measured: 6
// consecutive reads, zero variance) — screenshot-decoded luminance has no
// measurement noise floor to clear. The real constraint is Tone.Reverb's
// IR: it's generated from un-seedable white noise (`Math.random`, never
// pinned here — pinning it to a constant silences the reverb entirely,
// kb/verification.md), so the tail's actual measured strength varies
// run-to-run by over 30x in this window (observed: ~0.17–6.5 luminance
// above dry across repeated runs) — a fixed margin only needs to clear
// zero, not discriminate against noise. 3 (tuned against a single lucky
// run) failed on the low end of that real range most of the time
// (mawimbi#541 PR #550's CI); 0.1 clears true-zero with room to spare
// while staying safely under the weakest real draw observed.
const TAIL_ENERGY_MARGIN = 0.1;

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
    x: CLIP_X_START_PX,
    y: Math.round(
      playheadLineY - DRY_WINDOW_END_SEC * DEFAULT_PIXELS_PER_SECOND,
    ),
    width: viewportWidth - CLIP_X_START_PX,
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
