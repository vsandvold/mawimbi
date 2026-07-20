import {
  expect,
  test,
  uploadAudioFile,
  LONG_AUDIO,
  SHORT_AUDIO,
  dismissFullscreenOverlay,
  swipeTimeline,
  swipeTimelineHorizontal,
  touchTap,
  tracePlaybackState,
  stopPlaybackTrace,
} from './fixtures';
import { meanLuminance } from './helpers/pixelDecode';

/**
 * Track edit mode (spec 004, milestone 2) — the Effects drawer's phase-1
 * "spring-modal" state: one active track visually separates from the
 * rest of the mix. Covers Goals 1 and 6 (button-driven cycling only;
 * swipe-to-cycle is milestone 3).
 */

const CONTENT_SETTLE_WAIT_MS = 1000;
const DRAWER_ANIMATION_MS = 350;
// Matches workstationSignals.ts's DEFAULT_PIXELS_PER_SECOND (not exported).
const DEFAULT_PIXELS_PER_SECOND = 200;
// SHORT_AUDIO (active/newest track) ends at 0.5s; LONG_AUDIO (background
// track) runs to 2.0s. The dimming assertion samples a window inside that
// gap — background-only content, unoccluded by the active track — with a
// small margin on each side so a slightly-off elapsed→pixel mapping can't
// clip in stray content from either track's boundary.
const BACKGROUND_ONLY_WINDOW_START_SEC = 0.6;
const BACKGROUND_ONLY_WINDOW_END_SEC = 1.9;
// Comfortably past SCRUB_MOVEMENT_THRESHOLD_PX (8px) so the axis-lock
// reliably resolves to horizontal, and small enough to stay clear of the
// phantom's edges at typical viewport widths.
const SWIPE_DELTA_PX = 60;
const TOUCH_TAP_HOLD_MS = 50;
const GESTURE_SETTLE_WAIT_MS = 100;
// Well below the shared background dim (0.5) yet above 0, so the assertion
// tolerates a mid-transition read while still failing on a hidden track.
const MIN_VISIBLE_OPACITY = 0.1;

/**
 * Uploads the longer tone first (becomes the background track once edit
 * mode defaults to the newest) and the shorter tone second (becomes the
 * active track). Both are 440 Hz, so they only differ in duration — the
 * gap between them (elapsed 0.5s–2.0s) has content from the background
 * track alone, unoccluded by the active track, which is what the
 * dimming assertion below relies on.
 */
async function setUpTwoTracks(page: import('@playwright/test').Page) {
  await page.goto('/project/test-id');
  await uploadAudioFile(page, LONG_AUDIO);
  await expect(page.locator('.timeline__track')).toHaveCount(1);
  await uploadAudioFile(page, SHORT_AUDIO);
  await expect(page.locator('.timeline__track')).toHaveCount(2);
  await page.waitForTimeout(CONTENT_SETTLE_WAIT_MS);
}

async function rewindToStart(page: import('@playwright/test').Page) {
  await page.locator('.floating-toolbar').getByTitle('Rewind').click();
}

async function openEffectsDrawer(page: import('@playwright/test').Page) {
  await page.getByTitle('Show effects').click();
  await page.waitForTimeout(DRAWER_ANIMATION_MS);
}

async function closeEffectsDrawer(page: import('@playwright/test').Page) {
  // The toolbar's FX toggle is pointer-events: none while a content sheet
  // is open (ToolbarBottomSheet's `toolbar-sheet--hidden`) — closing goes
  // through the sheet's own Close button, same as mixer/lyrics.
  await page.getByTitle('Close').click();
  await page.waitForTimeout(DRAWER_ANIMATION_MS);
}

test.describe('Track edit mode entry/exit', () => {
  test.beforeEach(async ({ page }) => {
    await setUpTwoTracks(page);
  });

  test('opening the drawer separates the newest track from the rest; closing collapses it back', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    const activeTrack = tracks.last();
    const backgroundTrack = tracks.first();

    await openEffectsDrawer(page);

    await expect(activeTrack).toHaveClass(/timeline__track--edit-active/);
    await expect(backgroundTrack).toHaveClass(
      /timeline__track--edit-background/,
    );

    const activeOpacity = await activeTrack.evaluate(
      (el) => getComputedStyle(el).opacity,
    );
    const backgroundOpacity = await backgroundTrack.evaluate(
      (el) => getComputedStyle(el).opacity,
    );
    // The treatment is shared with the mixer focus effect — assert the
    // mechanism (active clearly above background), not exact values.
    expect(parseFloat(activeOpacity)).toBeGreaterThan(
      parseFloat(backgroundOpacity),
    );
    expect(parseFloat(backgroundOpacity)).toBeLessThan(0.9);

    // Separation uses the same cheap mechanism as the mixer-driven focus
    // effect — an opacity dim plus a z-index lift. No per-track filter,
    // transform, or shadow: each track's canvas covers the full runway
    // window, so those forced huge per-track composited layers and
    // duplicated the runway rails' glow on every track box.
    const backgroundStyles = await backgroundTrack.evaluate((el) => {
      const styles = getComputedStyle(el);
      return {
        filter: styles.filter,
        transform: styles.transform,
        boxShadow: styles.boxShadow,
      };
    });
    expect(backgroundStyles.filter).toBe('none');
    expect(backgroundStyles.transform).toBe('none');
    expect(backgroundStyles.boxShadow).toBe('none');

    const activeZIndex = await activeTrack.evaluate(
      (el) => getComputedStyle(el).zIndex,
    );
    const backgroundZIndex = await backgroundTrack.evaluate(
      (el) => getComputedStyle(el).zIndex,
    );
    expect(parseInt(activeZIndex, 10)).toBeGreaterThan(
      parseInt(backgroundZIndex, 10),
    );

    await closeEffectsDrawer(page);

    await expect(activeTrack).not.toHaveClass(/timeline__track--edit-active/);
    await expect(backgroundTrack).not.toHaveClass(
      /timeline__track--edit-background/,
    );
  });
});

test.describe('Track edit mode cycling', () => {
  test.beforeEach(async ({ page }) => {
    await setUpTwoTracks(page);
    await openEffectsDrawer(page);
  });

  test('previous/next buttons move the active class across tracks, clamped at both ends', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    const previousButton = page.getByTitle('Previous track');
    const nextButton = page.getByTitle('Next track');

    // Defaults to the newest track (mixer's top row, product rule #20).
    await expect(tracks.last()).toHaveClass(/timeline__track--edit-active/);
    await expect(nextButton).toBeDisabled();

    await previousButton.click();

    await expect(tracks.first()).toHaveClass(/timeline__track--edit-active/);
    await expect(tracks.last()).toHaveClass(
      /timeline__track--edit-background/,
    );
    await expect(previousButton).toBeDisabled();
    await expect(nextButton).toBeEnabled();
  });
});

test.describe('Track edit mode keeps every track visible', () => {
  test.beforeEach(async ({ page }) => {
    await setUpTwoTracks(page);
  });

  test('a muted background track stays visible while cycling', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    const mutedTrack = tracks.first();

    // Mute the older track from the mixer (its bottom row — the mixer
    // displays tracks in reverse order). The state button cycles
    // on → solo → mute; each step syncs on the resulting button title so
    // a click can't race the previous one.
    await page.getByTitle('Show mixer').click();
    await expect(page.locator('.bottom-sheet')).toBeVisible();
    const olderChannel = page.locator('.mixer__channel').last();
    await olderChannel.getByTitle('On').click();
    await expect(olderChannel.getByTitle('Solo')).toBeVisible();
    await olderChannel.getByTitle('Solo').click();
    await expect(olderChannel.getByTitle('Muted')).toBeVisible();
    await expect(mutedTrack).toHaveClass(/timeline__track--muted/);
    await page.getByTitle('Close').click();
    await expect(page.locator('.bottom-sheet')).toHaveCount(0);

    await openEffectsDrawer(page);

    // In edit mode every track stays visible — mute governs audio, not
    // visibility; a muted track renders dimmed like any background track.
    await expect(mutedTrack).toHaveClass(/timeline__track--edit-background/);
    await expectTrackVisible(mutedTrack);

    // Cycling onto and off the muted track never hides it.
    await page.getByTitle('Previous track').click();
    await expect(mutedTrack).toHaveClass(/timeline__track--edit-active/);
    await expectTrackVisible(mutedTrack);

    await page.getByTitle('Next track').click();
    await expect(mutedTrack).toHaveClass(/timeline__track--edit-background/);
    await expectTrackVisible(mutedTrack);
  });
});

test.describe('Track edit mode survives losing the edited track', () => {
  test.beforeEach(async ({ page }) => {
    await setUpTwoTracks(page);
    await openEffectsDrawer(page);
  });

  test('undoing the edited track re-anchors edit mode to the remaining track', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    await expect(tracks.last()).toHaveClass(/timeline__track--edit-active/);

    // The toolbar behind the drawer is pointer-events: none but its
    // buttons stay focusable, so keyboard activation (Enter on a focused
    // button fires a click) reaches Undo while the drawer is open —
    // dispatch the click directly to model that path.
    await page
      .getByTitle('Undo')
      .evaluate((el) => (el as HTMLElement).click());

    // Without re-anchoring, the stale focus id dims every remaining track
    // (all --edit-background, none active) with muting bypassed, and the
    // cycle buttons vanish — no way out but closing the drawer.
    await expect(tracks).toHaveCount(1);
    await expect(tracks.first()).toHaveClass(/timeline__track--edit-active/);
  });
});

async function expectTrackVisible(
  track: import('@playwright/test').Locator,
) {
  await expect(async () => {
    const opacity = await track.evaluate((el) =>
      parseFloat(getComputedStyle(el).opacity),
    );
    expect(opacity).toBeGreaterThan(MIN_VISIBLE_OPACITY);
  }).toPass();
}

test.describe('Track edit mode geometry invariant', () => {
  // Phase 1 must not touch geometry (spec 004): the solved custom
  // properties are a pure function of viewport + drawer height, so the
  // effects drawer (edit mode on) must resolve the same geometry as the
  // mixer drawer (edit mode off) — neither passes custom snap points, so
  // both open to the same default height.
  test('solved geometry matches the mixer drawer at the same height', async ({
    page,
  }) => {
    await setUpTwoTracks(page);
    await rewindToStart(page);

    await page.getByTitle('Show mixer').click();
    await page.waitForTimeout(DRAWER_ANIMATION_MS);
    const mixerGeometry = await getGeometryCustomProperties(page);
    await page.getByTitle('Close').click();
    await page.waitForTimeout(DRAWER_ANIMATION_MS);

    await openEffectsDrawer(page);
    const effectsGeometry = await getGeometryCustomProperties(page);

    expect(effectsGeometry).toEqual(mixerGeometry);
  });
});

async function getGeometryCustomProperties(
  page: import('@playwright/test').Page,
) {
  return page.locator('.scrubber').evaluate((el) => {
    const style = (el as HTMLElement).style;
    return {
      paddingTop: style.getPropertyValue('--timeline-padding-top'),
      paddingBottom: style.getPropertyValue('--timeline-padding-bottom'),
      playheadFraction: style.getPropertyValue('--playhead-fraction'),
    };
  });
}

test.describe('Track edit mode background dimming (decoded pixels)', () => {
  test.beforeEach(async ({ page }) => {
    // Flattens the tilt (scale(s) = 1 everywhere), so elapsed time maps
    // linearly to on-screen Y — the runway's real nonlinear projection
    // would otherwise make the elapsed→pixel offset below inexact.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setUpTwoTracks(page);
    await rewindToStart(page);
  });

  test('dims background-track content the active track does not occlude', async ({
    page,
  }) => {
    const beforeLuminance = await meanLuminance(
      page,
      await getElapsedWindowClip(
        page,
        BACKGROUND_ONLY_WINDOW_START_SEC,
        BACKGROUND_ONLY_WINDOW_END_SEC,
      ),
    );

    await openEffectsDrawer(page);

    // Opening the drawer resolves new geometry (drawer height changed),
    // so the playhead-relative clip is recomputed, not reused.
    const afterLuminance = await meanLuminance(
      page,
      await getElapsedWindowClip(
        page,
        BACKGROUND_ONLY_WINDOW_START_SEC,
        BACKGROUND_ONLY_WINDOW_END_SEC,
      ),
    );

    expect(afterLuminance).toBeLessThan(beforeLuminance);
  });
});

/**
 * A full-width clip spanning the on-screen Y range for track-elapsed time
 * `[elapsedStart, elapsedEnd)`, computed from the current playhead line
 * position (time 0) and the default zoom level.
 */
async function getElapsedWindowClip(
  page: import('@playwright/test').Page,
  elapsedStart: number,
  elapsedEnd: number,
) {
  const playheadLineY = await page
    .locator('.scrubber__playhead')
    .evaluate((el) => el.getBoundingClientRect().bottom);
  const viewportWidth = page.viewportSize()?.width ?? 0;

  return {
    x: 0,
    y: Math.round(playheadLineY - elapsedEnd * DEFAULT_PIXELS_PER_SECOND),
    width: viewportWidth,
    height: Math.round(
      (elapsedEnd - elapsedStart) * DEFAULT_PIXELS_PER_SECOND,
    ),
  };
}

test.describe('Track edit mode reduced-motion invariant', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setUpTwoTracks(page);
  });

  test('keeps the separation without animating', async ({ page }) => {
    await openEffectsDrawer(page);

    const tracks = page.locator('.timeline__track');
    await expect(tracks.last()).toHaveClass(/timeline__track--edit-active/);
    await expect(tracks.first()).toHaveClass(
      /timeline__track--edit-background/,
    );

    const backgroundOpacity = await tracks
      .first()
      .evaluate((el) => getComputedStyle(el).opacity);
    expect(parseFloat(backgroundOpacity)).toBeLessThan(0.9);

    const transitionDuration = await tracks
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(transitionDuration).toMatch(/^0s(,\s*0s)*$/);
  });
});

test.describe('Track edit mode swipe-to-cycle gesture', () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await setUpTwoTracks(page);
    await dismissFullscreenOverlay(page);
    await openEffectsDrawer(page);
  });

  test('swiping right moves the active class to the older track; swiping left moves it back', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    // Defaults to the newest track (mixer's top row, product rule #20).
    await expect(tracks.last()).toHaveClass(/timeline__track--edit-active/);

    // Swipe right = next-older (negative deltaX per swipeTimelineHorizontal).
    await swipeTimelineHorizontal(page, -SWIPE_DELTA_PX);
    await expect(tracks.first()).toHaveClass(/timeline__track--edit-active/);
    await expect(tracks.last()).toHaveClass(
      /timeline__track--edit-background/,
    );

    // Swipe left = next-newer, moving it back.
    await swipeTimelineHorizontal(page, SWIPE_DELTA_PX);
    await expect(tracks.last()).toHaveClass(/timeline__track--edit-active/);
    await expect(tracks.first()).toHaveClass(
      /timeline__track--edit-background/,
    );
  });

  test('swiping left past the newest track leaves the active track unchanged', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    await expect(tracks.last()).toHaveClass(/timeline__track--edit-active/);

    await swipeTimelineHorizontal(page, SWIPE_DELTA_PX);

    await expect(tracks.last()).toHaveClass(/timeline__track--edit-active/);
  });

  test('swiping right past the oldest track leaves the active track unchanged', async ({
    page,
  }) => {
    const tracks = page.locator('.timeline__track');
    await page.getByTitle('Previous track').click();
    await expect(tracks.first()).toHaveClass(/timeline__track--edit-active/);

    await swipeTimelineHorizontal(page, -SWIPE_DELTA_PX);

    await expect(tracks.first()).toHaveClass(/timeline__track--edit-active/);
  });

  test('a horizontal swipe does not toggle playback', async ({ page }) => {
    await tracePlaybackState(page);

    await swipeTimelineHorizontal(page, SWIPE_DELTA_PX);
    await page.waitForTimeout(GESTURE_SETTLE_WAIT_MS);

    const trace = await stopPlaybackTrace(page);
    expect(trace.length).toBe(0);
  });

  test('a plain tap still toggles playback', async ({ page }) => {
    await tracePlaybackState(page);

    await touchTap(page, TOUCH_TAP_HOLD_MS);
    await page.waitForTimeout(GESTURE_SETTLE_WAIT_MS);

    const trace = await stopPlaybackTrace(page);
    expect(trace.length).toBe(1);
  });

  test('a vertical swipe still scrubs the timeline', async ({ page }) => {
    const phantom = page.locator('.scrubber__phantom');
    // The runway opens at transport time 0, which is scrollTop's max end
    // (inverted scroll, kb/domain.md) — swipe with a negative delta so the
    // gesture moves away from that clamp instead of being absorbed by it.
    const scrollBefore = await phantom.evaluate((el) => el.scrollTop);

    await swipeTimeline(page, -SWIPE_DELTA_PX * 5);
    await page.waitForTimeout(GESTURE_SETTLE_WAIT_MS);

    const scrollAfter = await phantom.evaluate((el) => el.scrollTop);
    expect(scrollAfter).not.toBe(scrollBefore);
  });
});
