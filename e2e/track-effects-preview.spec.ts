import { expect, test, uploadAudioFile, BURST_TAIL_AUDIO } from './fixtures';
import { meanLuminance } from './helpers/pixelDecode';
import { getFirstTrackId } from './helpers/mawimbiBridge';

/**
 * Live effects preview while dragging (spec 006, milestone 6, mawimbi#543):
 * while a slider in the effects drawer is being dragged — before release —
 * the visible window of the active track's spectrogram shows an honest
 * windowed post-effect render as a provisional overlay. The overlay never
 * touches `SpectrogramCache`'s persisted entry: the entry's
 * `effectsParamsHash` must keep reading dry throughout the drag, and only
 * the eventual release/commit (spec 004 M6, `track-effects.spec.ts`)
 * changes it.
 *
 * Same fixture and dry-window geometry as `track-effects.spec.ts` — proven
 * tuned against `test-burst-tail.wav`'s decaying noise burst.
 */

const CONTENT_SETTLE_WAIT_MS = 3000;
const DRAWER_ANIMATION_MS = 350;
const DEFAULT_PIXELS_PER_SECOND = 200;
const DRY_WINDOW_START_SEC = 0.45;
const DRY_WINDOW_END_SEC = 0.75;
const CLIP_X_START_PX = 100;
const TAIL_ENERGY_MARGIN = 0.1;
// A drag step every ~30ms comfortably straddles PREVIEW_THROTTLE_MS's
// 150ms window (effectsPreview.ts) with several ticks, without needing to
// import the constant into an e2e spec that shouldn't depend on
// implementation internals.
const DRAG_STEP_DELAY_MS = 30;
const DRAG_STEPS = 8;

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

async function getEffectsHash(
  page: import('@playwright/test').Page,
  trackId: string,
): Promise<string | undefined> {
  return page.evaluate(
    (id) => window.__mawimbi?.spectrogramCache.getEntry(id)?.effectsParamsHash,
    trackId,
  );
}

async function hasPreviewOverlay(
  page: import('@playwright/test').Page,
  trackId: string,
): Promise<boolean> {
  const result = await page.evaluate(
    (id) => window.__mawimbi?.previewOverlay.hasOverlay(id),
    trackId,
  );
  return result ?? false;
}

/** Drags the Space slider's thumb toward its maximum without releasing.
 * Radix's slider drag calls the real `setPointerCapture` Web API on
 * `pointerdown`, which only succeeds for a pointer the browser itself
 * considers active — a `dispatchEvent('pointerdown', ...)` (CLAUDE.md's
 * usual recommendation for custom pointer gestures) doesn't create one, so
 * capture silently fails and no drag registers. `page.mouse` drives a real
 * CDP-level pointer session instead; safe here since the slider is a
 * normal static-position element, not part of the tilted/transformed
 * runway that motivated the `dispatchEvent` guidance elsewhere. Caller is
 * responsible for the eventual `page.mouse.up()`. */
async function dragSpaceSliderWithoutRelease(
  page: import('@playwright/test').Page,
) {
  const thumb = page.getByRole('slider', { name: 'Space amount' });
  // Thumb's parent is a positioning wrapper span, not the slider root —
  // Track is a sibling of that wrapper one level further up.
  const track = thumb.locator('xpath=../../span[@data-slot="slider-track"]');
  const box = await track.boundingBox();
  if (!box) throw new Error('Space slider track not found');

  const y = box.y + box.height / 2;
  const startX = box.x;
  const endX = box.x + box.width;

  await page.mouse.move(startX, y);
  await page.mouse.down();

  for (let step = 1; step <= DRAG_STEPS; step++) {
    const x = startX + ((endX - startX) * step) / DRAG_STEPS;
    await page.mouse.move(x, y);
    await page.waitForTimeout(DRAG_STEP_DELAY_MS);
  }

  return { thumb };
}

/** Drags the Space slider's thumb to its maximum and back down to its
 * starting value (0), without releasing — a round trip. Radix's own
 * `onValueCommit` only fires when the released value differs from the
 * value at drag-*start* (`@radix-ui/react-slider`'s `handleSlideEnd`), so
 * releasing after this drag never calls it at all. */
async function dragSpaceSliderRoundTrip(page: import('@playwright/test').Page) {
  const thumb = page.getByRole('slider', { name: 'Space amount' });
  const track = thumb.locator('xpath=../../span[@data-slot="slider-track"]');
  const box = await track.boundingBox();
  if (!box) throw new Error('Space slider track not found');

  const y = box.y + box.height / 2;
  const startX = box.x;
  const endX = box.x + box.width;

  await page.mouse.move(startX, y);
  await page.mouse.down();

  for (let step = 1; step <= DRAG_STEPS; step++) {
    const x = startX + ((endX - startX) * step) / DRAG_STEPS;
    await page.mouse.move(x, y);
    await page.waitForTimeout(DRAG_STEP_DELAY_MS);
  }
  for (let step = DRAG_STEPS - 1; step >= 0; step--) {
    const x = startX + ((endX - startX) * step) / DRAG_STEPS;
    await page.mouse.move(x, y);
    await page.waitForTimeout(DRAG_STEP_DELAY_MS);
  }

  return { thumb };
}

test.describe('Live effects preview while dragging', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/project/test-id');
    await uploadAudioFile(page, BURST_TAIL_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(1);
    await page.waitForTimeout(CONTENT_SETTLE_WAIT_MS);
    await rewindToStart(page);
  });

  test('a live drag shows tail energy in the preview window without touching the persisted (dry) entry, then commits normally on release', async ({
    page,
  }) => {
    await openEffectsDrawer(page);
    const trackId = await getFirstTrackId(page);

    const dryLuminance = await meanLuminance(page, await dryWindowClip(page));
    const dryHash = await getEffectsHash(page, trackId);

    const { thumb } = await dragSpaceSliderWithoutRelease(page);
    await expect(thumb).toHaveAttribute('aria-valuenow', '100');

    // Still mid-drag: the preview overlay shows tail energy in what was a
    // near-black dry region, but the persisted entry's hash — and the
    // overlay-presence bridge — must both confirm nothing has committed
    // yet.
    await expect(async () => {
      const luminance = await meanLuminance(page, await dryWindowClip(page));
      expect(luminance).toBeGreaterThan(dryLuminance + TAIL_ENERGY_MARGIN);
    }).toPass({ timeout: 15_000 });

    expect(await getEffectsHash(page, trackId)).toBe(dryHash);
    expect(await hasPreviewOverlay(page, trackId)).toBe(true);

    // Release — commits the amount (spec 004 M6) and clears the preview
    // overlay (Decision 1 teardown).
    await page.mouse.up();

    await expect
      .poll(() => hasPreviewOverlay(page, trackId), { timeout: 15_000 })
      .toBe(false);

    // Existing commit behavior (track-effects.spec.ts) still holds: the
    // persisted entry's hash changes and the committed tiles show tail
    // energy on their own, independent of any preview.
    await expect
      .poll(() => getEffectsHash(page, trackId), { timeout: 15_000 })
      .not.toBe(dryHash);

    await expect(async () => {
      const luminance = await meanLuminance(page, await dryWindowClip(page));
      expect(luminance).toBeGreaterThan(dryLuminance + TAIL_ENERGY_MARGIN);
    }).toPass({ timeout: 15_000 });
  });

  // Regression for a code-review finding (mawimbi#551), confirmed against a
  // real drag before the fix: Radix's onValueCommit never fires when a drag
  // releases back at its starting value, so clearing the overlay only from
  // `commitAmount` left it stuck on screen indefinitely for this gesture.
  test('a round-trip drag back to the original amount still clears the preview overlay on release', async ({
    page,
  }) => {
    await openEffectsDrawer(page);
    const trackId = await getFirstTrackId(page);
    const dryHash = await getEffectsHash(page, trackId);

    const { thumb } = await dragSpaceSliderRoundTrip(page);
    await expect(thumb).toHaveAttribute('aria-valuenow', '0');

    await expect
      .poll(() => hasPreviewOverlay(page, trackId), { timeout: 15_000 })
      .toBe(true);

    await page.mouse.up();

    await expect
      .poll(() => hasPreviewOverlay(page, trackId), { timeout: 15_000 })
      .toBe(false);
    // The overlay clearing directly (not via a hash change) is exactly the
    // point of this test — the committed hash is genuinely unchanged.
    expect(await getEffectsHash(page, trackId)).toBe(dryHash);
  });
});
