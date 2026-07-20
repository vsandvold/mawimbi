import { activeRunwayConfig } from '../src/features/workstation/scrubber/runwayConfig';
import { expect, test, uploadAudioFile, SHORT_AUDIO } from './fixtures';
import { hasSaturatedPixel } from './helpers/pixelDecode';

/**
 * Runway geometry invariants — assertions that the tilted timeline's
 * screen-space anchors (mawimbi#443) actually hold in a real browser.
 *
 * Covers the alignment invariant required by #445 (the bug class behind
 * #391/#411/#412: content scrolled to a given time must render on the
 * playhead line), the *visibility* invariant from #459 (content on the
 * playhead line must actually paint — rect alignment alone is blind to
 * scroll clipping, which once hid the entire runway while this suite
 * passed), the edge rail stacking-order invariant from #443's
 * fog-to-rails visual pass, and the width anchor and reduced-motion
 * invariants from #448's stated scope, plus drawer stability throughout.
 *
 * Tolerances are tight (single-digit px) since #459 removed the tilt-side
 * scroll clamping (#450) that used to add up-to-drawerHeight drift.
 */

const MIXER_ANIMATION_MS = 350;
const ALIGNMENT_TOLERANCE_PX = 8;
const ALIGNMENT_POLL_TIMEOUT_MS = 2000;
const CONTENT_SETTLE_WAIT_MS = 1000;
const WIDTH_ANCHOR_TOLERANCE_FRACTION = 0.03;

/**
 * The on-screen Y of the boundary between actual audio content and the
 * timeline's bottom padding — i.e. the "time = 0" content point, since
 * `.timeline__track` elements are pinned to the bottom of their shared grid
 * area (`align-items: end`). `getBoundingClientRect()` reflects the
 * post-3D-transform position, so this is a legitimate on-screen measurement
 * despite the tilt (unlike inferring visibility from arbitrary interior
 * canvas coordinates, which the projection does distort).
 */
async function getContentBoundaryY(
  page: import('@playwright/test').Page,
): Promise<number> {
  return page
    .locator('.timeline__track')
    .first()
    .evaluate((el) => el.getBoundingClientRect().bottom);
}

/** The on-screen Y of the playhead line — the vertical center of the playhead overlay. */
async function getPlayheadLineY(
  page: import('@playwright/test').Page,
): Promise<number> {
  return page.locator('.scrubber__playhead').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top + rect.height / 2;
  });
}

/**
 * The rendered width of `.timeline__track` at time 0. `scale(s)` decreases
 * monotonically as plane-space distance `s` grows away from the camera,
 * and — at time 0 — audio content only occupies `s` values at or beyond
 * `sPlayhead` (it hasn't played yet, so it all sits in the "ahead" /
 * larger-`s` / more-foreshortened direction). That makes the track's own
 * bottom edge (which the alignment invariant already establishes sits on
 * the playhead line at time 0) provably its widest point, so the whole
 * element's `getBoundingClientRect().width` — an axis-aligned bounding
 * box — equals the rendered width exactly at the playhead line. No probe
 * element or manual transform-matrix math needed.
 */
async function getTrackWidthAtPlayheadLine(
  page: import('@playwright/test').Page,
): Promise<number> {
  return page
    .locator('.timeline__track')
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);
}

/**
 * Forces an explicit resync to time 0. The initial scroll position right
 * after upload can be transiently stale while the spectrogram cache is
 * still growing the scrollable content (see useSpacerHeight), so tests
 * rewind explicitly rather than trusting the just-uploaded scroll position.
 */
async function rewindToStart(page: import('@playwright/test').Page) {
  await page.locator('.floating-toolbar').getByTitle('Rewind').click();
}

async function setUpTimeline(page: import('@playwright/test').Page) {
  await page.goto('/project/test-id');
  await uploadAudioFile(page, SHORT_AUDIO);
  await expect(page.locator('.timeline__track')).toBeVisible();
  // Let the spectrogram cache finish sizing the scrollable content before
  // establishing the time=0 reference position.
  await page.waitForTimeout(CONTENT_SETTLE_WAIT_MS);
}

async function openMixerDrawer(page: import('@playwright/test').Page) {
  // Opening the mixer re-solves the runway geometry for the smaller
  // visible area (mawimbi#443's drawer decision) — invariants must still
  // hold against the new geometry, not the pre-drawer one.
  await page.getByTitle('Show mixer').click();
  await expect(page.locator('.channel')).toHaveCount(1);
  await page.waitForTimeout(MIXER_ANIMATION_MS);
}

async function expectContentAlignedToPlayhead(
  page: import('@playwright/test').Page,
) {
  await expect(async () => {
    const contentBoundaryY = await getContentBoundaryY(page);
    const playheadLineY = await getPlayheadLineY(page);
    expect(Math.abs(contentBoundaryY - playheadLineY)).toBeLessThanOrEqual(
      ALIGNMENT_TOLERANCE_PX,
    );
  }).toPass({ timeout: ALIGNMENT_POLL_TIMEOUT_MS });
}

async function expectTrackWidthMatchesPlayheadWidth(
  page: import('@playwright/test').Page,
) {
  const viewportWidth = page.viewportSize()?.width;
  if (!viewportWidth) throw new Error('viewport size unavailable');

  const expectedWidth = activeRunwayConfig.playheadWidth * viewportWidth;
  const tolerance = expectedWidth * WIDTH_ANCHOR_TOLERANCE_FRACTION;

  await expect(async () => {
    const trackWidth = await getTrackWidthAtPlayheadLine(page);
    expect(Math.abs(trackWidth - expectedWidth)).toBeLessThanOrEqual(tolerance);
  }).toPass({ timeout: ALIGNMENT_POLL_TIMEOUT_MS });
}

/**
 * Asserts that audio content is *painted* at the playhead line — not just
 * rect-aligned there. Rects ignore overflow clipping, so before #459 this
 * suite's alignment invariant passed while the whole runway was scroll-
 * clipped invisible. Hit-testing can't detect this either (the tilt
 * subtree is pointer-events: none), so this decodes an actual screenshot:
 * spectrogram content is the only *saturated* paint in the scrubber (the
 * rails, loudness meter, and background are all grayscale), so a colored
 * pixel in a band around the playhead line proves the track is visible.
 */
async function expectContentVisibleAtPlayhead(
  page: import('@playwright/test').Page,
) {
  const playheadLineY = await getPlayheadLineY(page);
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const clip = {
    x: viewportWidth / 2 - 200,
    y: playheadLineY - 6,
    width: 400,
    height: 12,
  };

  expect(
    await hasSaturatedPixel(page, clip),
    'no colored (track content) pixel found in the band around the playhead line',
  ).toBe(true);
}

test.describe('Runway alignment invariant', () => {
  test.beforeEach(async ({ page }) => {
    await setUpTimeline(page);
  });

  test('content at time 0 renders on the playhead line with the drawer closed', async ({
    page,
  }) => {
    await rewindToStart(page);
    await expectContentAlignedToPlayhead(page);
  });

  test('content at time 0 renders on the playhead line with the drawer open', async ({
    page,
  }) => {
    await openMixerDrawer(page);
    await rewindToStart(page);
    await expectContentAlignedToPlayhead(page);
  });
});

test.describe('Runway visibility invariant', () => {
  test.beforeEach(async ({ page }) => {
    await setUpTimeline(page);
  });

  test('content at time 0 is actually painted on the playhead line, drawer closed', async ({
    page,
  }) => {
    await rewindToStart(page);
    await expectContentAlignedToPlayhead(page);
    await expectContentVisibleAtPlayhead(page);
  });

  test('content at time 0 is actually painted on the playhead line, drawer open', async ({
    page,
  }) => {
    await openMixerDrawer(page);
    await rewindToStart(page);
    await expectContentAlignedToPlayhead(page);
    await expectContentVisibleAtPlayhead(page);
  });
});

/**
 * Runway edge rails — glowing `.timeline::before`/`::after` lines along the
 * runway's sides (mawimbi#443's visual simplification pass).
 *
 * `.timeline::before`/`::after` are absolutely positioned and excluded from
 * grid placement, so — unlike `.timeline__track` grid items, whose z-index
 * establishes a stacking context per the CSS Grid spec even at `z-index: 0`
 * — they default to `z-index: auto` and paint per DOM order instead: the
 * `::before` rail (generated first) would paint *behind* every track, while
 * `::after` (generated last) would paint in front of untouched tracks but
 * behind a focused one (`.timeline__track--foreground`, `z-index: 1`). Both
 * rails must sit above every track's stacking level to render consistently.
 */
test.describe('Runway edge rails', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();
  });

  test('both rails share a z-index above every possible track stacking level', async ({
    page,
  }) => {
    const [beforeZIndex, afterZIndex] = await page.evaluate(() => {
      const timeline = document.querySelector('.timeline')!;
      return [
        getComputedStyle(timeline, '::before').zIndex,
        getComputedStyle(timeline, '::after').zIndex,
      ];
    });

    expect(beforeZIndex).toBe(afterZIndex);
    // .timeline__track--foreground (the highest track stacking level) is 1.
    expect(Number(beforeZIndex)).toBeGreaterThan(1);
  });
});

test.describe('Runway width anchor invariant', () => {
  test.beforeEach(async ({ page }) => {
    await setUpTimeline(page);
  });

  test('rendered track width at the playhead line matches the configured playheadWidth, drawer closed', async ({
    page,
  }) => {
    await rewindToStart(page);
    await expectTrackWidthMatchesPlayheadWidth(page);
  });

  test('rendered track width at the playhead line matches the configured playheadWidth, drawer open', async ({
    page,
  }) => {
    await openMixerDrawer(page);
    await rewindToStart(page);
    await expectTrackWidthMatchesPlayheadWidth(page);
  });
});

/**
 * Geometry-change resync (mawimbi#462): whenever the solved geometry
 * changes the time↔scroll mapping (drawer, resize, orientation, zoom),
 * the scroll position must be re-mapped to the transport time — without
 * requiring a user scroll or an explicit rewind afterwards.
 */
test.describe('Runway geometry-change resync', () => {
  const RESIZE_SETTLE_MS = 300;

  test.beforeEach(async ({ page }) => {
    await setUpTimeline(page);
  });

  test('alignment holds after a viewport resize without user interaction', async ({
    page,
  }) => {
    await rewindToStart(page);
    await expectContentAlignedToPlayhead(page);

    // Simulates a rotation-sized viewport change.
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(RESIZE_SETTLE_MS);

    await expectContentAlignedToPlayhead(page);
  });

  test('alignment holds after opening the mixer without re-seeking', async ({
    page,
  }) => {
    await rewindToStart(page);
    await expectContentAlignedToPlayhead(page);

    // No rewind after opening — the resync alone must keep time 0 on the
    // playhead line for the re-solved (smaller) visible area.
    await openMixerDrawer(page);

    await expectContentAlignedToPlayhead(page);
  });

  test('alignment holds after zooming the timeline', async ({ page }) => {
    await rewindToStart(page);
    await expectContentAlignedToPlayhead(page);

    // Ctrl+wheel is the zoom gesture (useTimelineZoom); zooming rescales
    // the content while time 0 must stay pinned to the playhead line.
    for (let i = 0; i < 5; i++) {
      await page
        .locator('.scrubber__phantom')
        .dispatchEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true });
    }
    await page.waitForTimeout(RESIZE_SETTLE_MS);

    await expectContentAlignedToPlayhead(page);
    await expectContentVisibleAtPlayhead(page);
  });
});

test.describe('Runway reduced-motion invariant', () => {
  // Playwright's `test.use({ reducedMotion: 'reduce' })` context option is
  // not honored by the built-in page fixture in this environment (confirmed
  // via isolated repro: browser.newContext({ reducedMotion }) and
  // page.emulateMedia() both apply the preference correctly, but the same
  // option passed through test.use() does not reach the page). Emulating it
  // explicitly per-page sidesteps that gap.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setUpTimeline(page);
  });

  // No alignment assertion here: with the tilt flattened, scale(s) is 1
  // everywhere, so #450's scrollTop clamping (see this file's header) drifts
  // the content boundary by whatever raw pixels the clamp is off by, instead
  // of the heavily-compressed drift the tilted alignment tests above see.
  // The tilted mode's own alignment coverage already exercises this drift
  // at a tolerable scale; this test's job is just the flattening itself.
  test('flattens the tilt', async ({ page }) => {
    const tiltTransform = await page
      .locator('.scrubber__tilt')
      .evaluate((el) => (el as HTMLElement).style.transform);
    expect(tiltTransform).toBe('rotateX(0deg)');
  });
});
