import {
  expect,
  test,
  uploadAudioFile,
  BURST_TAIL_AUDIO,
  CLICK_120BPM_AUDIO,
  LONG_AUDIO,
} from './fixtures';
import { meanLuminance } from './helpers/pixelDecode';
import {
  getFirstTrackId,
  waitForBackgroundAnalysis,
} from './helpers/mawimbiBridge';

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

/**
 * Every macro's slider has to be reachable at the *smallest* sheet snap
 * (`BottomSheet.tsx`'s `SNAP_POINT_SMALL_PX`, used when the viewport is
 * shorter than 425px — a landscape phone). `.bottom-sheet` is
 * `overflow: hidden` with its content area sized to the snap height, so a
 * row that doesn't fit is silently clipped rather than scrolled into reach:
 * adding Crush pushed the content to 182px of 160px, hiding the Tone row
 * entirely, with every other check green (`/code-review` on PR #578).
 *
 * jsdom can't see this — it has no real layout (kb/verification.md) — so
 * the invariant lives here, as a measurement rather than a CSS comment.
 */
const SMALL_SNAP_VIEWPORT = { width: 800, height: 400 };

test.describe('Effects drawer fits the smallest sheet snap', () => {
  test.use({ viewport: SMALL_SNAP_VIEWPORT });

  test('every macro row is inside the sheet at the small-viewport snap', async ({
    page,
  }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(1);
    await openEffectsDrawer(page);

    const fit = await page.evaluate(() => {
      const content = document.querySelector('.bottom-sheet__content')!;
      const inner = document.querySelector('.effects-bottom-sheet')!;
      return {
        available: content.clientHeight,
        needed: inner.scrollHeight,
        slidersBottom: document
          .querySelector('.effects-bottom-sheet__sliders')!
          .getBoundingClientRect().bottom,
        contentBottom: content.getBoundingClientRect().bottom,
      };
    });

    expect(fit.needed).toBeLessThanOrEqual(fit.available);
    // The scrollHeight comparison alone would pass if the sliders block were
    // positioned out of the visible area some other way, so assert the last
    // row's painted bottom edge is inside the sheet too.
    expect(fit.slidersBottom).toBeLessThanOrEqual(fit.contentBottom);
  });
});

/**
 * Tempo-synced Echo (spec 007 milestone 4, #560) — the drawer half of
 * Goal 5: with a confident tempo the Echo row gains subdivision choices,
 * and tapping one commits.
 *
 * Runs at the small-snap viewport on purpose. The subdivision control is the
 * first thing added to the drawer since Crush took its content to 182px of
 * the 160px snap (`/code-review` on PR #578), so "does the drawer still fit"
 * is asserted in the same breath as "the control is there" — it shares the
 * Echo row rather than taking a row of its own precisely because of that
 * budget, and this is the only level that can see it (jsdom has no layout).
 *
 * The audible half — that a synced delay reaches the rendered audio — is
 * asserted at unit level instead (`EffectsChain.test.ts`, offline/live
 * agreement on the shared param source). The issue asked for a tail-energy
 * pixel assertion on the burst fixture using the pattern above, but that
 * fixture scores exactly 0.00 tempo confidence (`RhythmAnalyser.fixtures.
 * test.ts`), so by this feature's own design it can never show a
 * subdivision control to click: the two requirements are mutually
 * exclusive on one fixture. The fixtures that *do* clear the threshold are
 * ~17s click tracks whose only silent region sits far past the visible
 * runway at any usable zoom, with clicks smearing ~0.42s into every gap in
 * between (see DRY_WINDOW_START_SEC above).
 */
const BADGE_TIMEOUT_MS = 60_000;
const DOTTED_EIGHTH_TITLE = 'Echo in dotted eighth notes';

test.describe('Tempo-synced Echo', () => {
  test.use({ viewport: SMALL_SNAP_VIEWPORT });

  test('a confident tempo adds a subdivision control that commits, and the drawer still fits the smallest snap', async ({
    page,
  }) => {
    test.setTimeout(BADGE_TIMEOUT_MS + 30_000);

    // Melody extraction contributes nothing here and is the expensive job
    // on the shared spectrogram worker, delaying the rhythm result this
    // test waits for by tens of seconds on a 17s fixture (same reason and
    // mechanism as `track-tempo.spec.ts`).
    await page.route('**/basic-pitch-model/**', (route) =>
      route.fulfill({ status: 404, body: '' }),
    );

    await page.goto('/project/test-id');
    await uploadAudioFile(page, CLICK_120BPM_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(1);
    await openEffectsDrawer(page);

    // The badge is the visible proof the estimate has landed; the
    // subdivision control is gated on the same call, so waiting for one is
    // waiting for both.
    await expect(page.getByTitle('Estimated tempo')).toBeVisible({
      timeout: BADGE_TIMEOUT_MS,
    });
    const subdivisions = page.getByRole('group', { name: 'Echo sync' });
    await expect(subdivisions).toBeVisible();
    await expect(subdivisions.getByRole('button')).toHaveCount(4);

    const fit = await page.evaluate(() => {
      const content = document.querySelector('.bottom-sheet__content')!;
      const inner = document.querySelector('.effects-bottom-sheet')!;
      return {
        available: content.clientHeight,
        needed: inner.scrollHeight,
        slidersBottom: document
          .querySelector('.effects-bottom-sheet__sliders')!
          .getBoundingClientRect().bottom,
        contentBottom: content.getBoundingClientRect().bottom,
      };
    });
    expect(fit.needed).toBeLessThanOrEqual(fit.available);
    expect(fit.slidersBottom).toBeLessThanOrEqual(fit.contentBottom);

    await page.getByTitle(DOTTED_EIGHTH_TITLE).click();
    await expect(page.getByTitle(DOTTED_EIGHTH_TITLE)).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Tapping the selected subdivision again turns sync off — the control
    // is its own on/off switch, with no separate toggle to disagree with.
    await page.getByTitle(DOTTED_EIGHTH_TITLE).click();
    await expect(page.getByTitle(DOTTED_EIGHTH_TITLE)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

/**
 * Crush macro (spec 007 milestone 2, #558) — bit-depth reduction is
 * broadband distortion, so its falsifiable visual signature is energy
 * appearing *above* a pure tone's fundamental, where the dry render is
 * near-black.
 *
 * `test-tone-long.wav` is a 2.0 s 440 Hz sine. Tiles are transposed for the
 * vertical timeline (`SpectrogramTileRenderer`: bin 0 = leftmost column)
 * and drawn stretched across the track's full width, so a CQT bin maps to a
 * fixed fraction of that width. At 24 bins/octave from C1 (32.7 Hz) the
 * 440 Hz fundamental sits at bin ~90 of ~225, i.e. ~40% across; the right
 * half of the track therefore starts just below the second harmonic
 * (880 Hz, bin ~114) and contains nothing at all in the dry render.
 */
const HARMONIC_BAND_START_FRACTION = 0.5;
// Same time window as the tail assertion above: proven to sit inside the
// scrubber's canvas window at the default zoom (kb/verification.md — a
// window computed from playhead − elapsed × pps can silently fall outside
// the drawn content and sample inert background instead).
const TONE_WINDOW_START_SEC = 0.45;
const TONE_WINDOW_END_SEC = 0.75;
// Quantization distortion at full crush is a gross, broadband change, not
// the ~0.17–6.5 luminance whisper a randomly-seeded reverb tail produces —
// but the margin only has to clear zero to be falsifiable, and staying well
// under the real signal keeps this from re-tuning on every palette tweak.
const HARMONIC_ENERGY_MARGIN = 0.1;

async function harmonicBandClip(page: import('@playwright/test').Page) {
  const playheadLineY = await page
    .locator('.scrubber__playhead')
    .evaluate((el) => el.getBoundingClientRect().bottom);
  const track = await page
    .locator('.timeline__track')
    .first()
    .evaluate((el) => {
      const { left, width } = el.getBoundingClientRect();
      return { left, width };
    });

  return {
    x: Math.round(track.left + track.width * HARMONIC_BAND_START_FRACTION),
    y: Math.round(
      playheadLineY - TONE_WINDOW_END_SEC * DEFAULT_PIXELS_PER_SECOND,
    ),
    width: Math.round(track.width * (1 - HARMONIC_BAND_START_FRACTION)),
    height: Math.round(
      (TONE_WINDOW_END_SEC - TONE_WINDOW_START_SEC) * DEFAULT_PIXELS_PER_SECOND,
    ),
  };
}

test.describe('Crush macro', () => {
  test.beforeEach(async ({ page }) => {
    // Flattens the tilt so elapsed time maps linearly to on-screen Y — same
    // reason as the tail suite above.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(1);
    // Melody and rhythm extraction share the spectrogram worker; a preview
    // or refresh render queues behind them, so wait for the upload's
    // background jobs rather than a fixed settle (kb/verification.md, #577).
    await waitForBackgroundAnalysis(page, await getFirstTrackId(page));
    await rewindToStart(page);
  });

  test('turning Crush up adds harmonic energy above the fundamental; turning it back down restores near-black', async ({
    page,
  }) => {
    // Measured after the drawer opens: opening it changes the runway
    // geometry, which moves the playhead line the window is derived from.
    await openEffectsDrawer(page);
    const dryLuminance = await meanLuminance(page, await harmonicBandClip(page));

    const crushThumb = page.getByRole('slider', { name: 'Crush amount' });
    await crushThumb.focus();
    await crushThumb.press('End');
    await expect(crushThumb).toHaveAttribute('aria-valuenow', '100');

    await expect(async () => {
      const luminance = await meanLuminance(page, await harmonicBandClip(page));
      expect(luminance).toBeGreaterThan(dryLuminance + HARMONIC_ENERGY_MARGIN);
    }).toPass({ timeout: 20_000 });

    await crushThumb.focus();
    await crushThumb.press('Home');
    await expect(crushThumb).toHaveAttribute('aria-valuenow', '0');

    await expect(async () => {
      const luminance = await meanLuminance(page, await harmonicBandClip(page));
      expect(luminance).toBeLessThan(dryLuminance + HARMONIC_ENERGY_MARGIN);
    }).toPass({ timeout: 20_000 });
  });
});
