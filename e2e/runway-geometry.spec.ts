import { expect, test, uploadAudioFile, SHORT_AUDIO } from './fixtures';

/**
 * Runway geometry invariants — assertions that the tilted timeline's
 * screen-space anchors (mawimbi#443) actually hold in a real browser.
 *
 * This file currently covers the alignment invariant required by #445
 * (the bug class behind #391/#411/#412: content scrolled to a given time
 * must render on the playhead line). The full invariant suite planned in
 * #448 (width anchor, drawer stability, reduced motion) extends this file.
 *
 * Tolerance note: a small residual drift (a few px with the drawer closed,
 * up to ~35px with the mixer open) is expected here and tracked separately
 * in #450 — `.scrubber__tilt`'s own scrollTop gets silently clamped by the
 * browser to its (undiminished) box's scrollable range whenever the drawer
 * is open, short of what `.scrubber__phantom` (which does shrink) asks for.
 * That's a pre-existing scroll-mechanics issue from #419/#420, orthogonal to
 * the projection math this file is validating.
 */

const MIXER_ANIMATION_MS = 350;
const ALIGNMENT_TOLERANCE_PX = 40;
const ALIGNMENT_POLL_TIMEOUT_MS = 2000;
const CONTENT_SETTLE_WAIT_MS = 1000;

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
 * Forces an explicit resync to time 0. The initial scroll position right
 * after upload can be transiently stale while the spectrogram cache is
 * still growing the scrollable content (see useSpacerHeight), so tests
 * rewind explicitly rather than trusting the just-uploaded scroll position.
 */
async function rewindToStart(page: import('@playwright/test').Page) {
  await page.locator('.floating-toolbar').getByTitle('Rewind').click();
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

test.describe('Runway alignment invariant', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, SHORT_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();
    // Let the spectrogram cache finish sizing the scrollable content before
    // establishing the time=0 reference position.
    await page.waitForTimeout(CONTENT_SETTLE_WAIT_MS);
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
    // Opening the mixer re-solves the runway geometry for the smaller
    // visible area (mawimbi#443's drawer decision) — alignment must still
    // hold against the new geometry, not the pre-drawer one.
    await page.getByTitle('Show mixer').click();
    await expect(page.locator('.channel')).toHaveCount(1);
    await page.waitForTimeout(MIXER_ANIMATION_MS);

    await rewindToStart(page);
    await expectContentAlignedToPlayhead(page);
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
