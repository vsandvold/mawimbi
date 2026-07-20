import {
  expect,
  test,
  uploadAudioFile,
  LONG_AUDIO_10S,
  pinchTimeline,
  tracePlaybackState,
  stopPlaybackTrace,
  dismissFullscreenOverlay,
} from './fixtures';
import { getEngineTime } from './helpers/mawimbiBridge';

/**
 * Pinch-to-zoom integration (spec 002 milestone 4, issue #476): a two-finger
 * pinch must zoom the timeline without ever being misread as a one-finger
 * scrub — no pause, no debounced seek. Before this milestone `Scrubber.tsx`
 * called `useTimelineZoom` but discarded its `isPinchingRef`, so the scrub
 * controller had no way to know a pinch was in progress at all (spec 002
 * "Bug analysis" mechanism 5).
 *
 * The three tests below already passed before the `isPinchingRef` wiring
 * landed — #474's pointer-count gate alone already covers a pinch whose two
 * touches land together, which is all CDP's `pinchTimeline` (both touches
 * in one dispatch) can simulate. The wiring's own regression coverage is
 * two other tests, which *do* fail without it: `Scrubber.test.tsx`'s
 * "aborts an armed scrub and resumes without seeking when a pinch starts
 * mid-drag" (a resting finger already scrubbing before a second finger
 * joins — a real race the pointer-count gate alone doesn't reach) and
 * "recovers single-finger scrubbing after a pinch ends via touchcancel,
 * not just touchend" (a stuck `isPinchingRef` would otherwise silently
 * swallow every later single-finger drag). Both live as unit tests, not
 * here: reproducing "a second touch joins an already-active touch sequence
 * without lifting the first" needs touch continuity that CDP's
 * `Input.dispatchTouchEvent` doesn't carry through to React's synthetic
 * pointer events in this environment (confirmed by instrumenting the real
 * handlers — `pointermove` simply stops firing after the second finger's
 * `touchStart` is dispatched, the native `touchstart` listener aside). The
 * unit tests drive `fireEvent.pointerDown/pointerMove` and native
 * `TouchEvent`s directly against the real (unmocked) `Scrubber` component
 * instead, exercising the same code path without depending on CDP's touch
 * synthesis.
 *
 * "Still playing"/"still paused" is checked via the flap tracer (transition
 * *count*, not a visibility poll — kb/verification.md, "State-flap bugs
 * need transition traces") rather than polling the button's title mid-pinch:
 * a misclassified pinch pauses and then debounce-resumes, which a poll can
 * straddle and false-pass exactly like the bugs in `playback-toggle.spec.ts`.
 *
 * Zoom is verified by reading `.spectrogram`'s inline `style.height`
 * (`= duration * pixelsPerSecond`, set in `Spectrogram.tsx`) directly,
 * rather than `getBoundingClientRect()` — the runway's 3D tilt transform
 * distorts on-screen rects (see `runway-geometry.spec.ts`), but the inline
 * style is the pre-transform layout value pinch-to-zoom actually writes.
 *
 * "No spurious seek" is verified via `getEngineTime` (`helpers/mawimbiBridge.ts`,
 * the real `Tone.Transport` position) rather than re-deriving time from
 * `scrollTop`/`pixelsPerSecond` in the test — that math is exactly the
 * fragile proxy the bridge exists to avoid, and pixelsPerSecond changing
 * mid-gesture is the whole point here.
 */

const PINCH_SCALE_OUT = 1.5;
const ZOOM_RATIO_PRECISION_DIGITS = 1; // toBeCloseTo: |actual - expected| < 0.05
const NO_TRANSITIONS = 0;
const ENGINE_TIME_PROGRESSING_POLL_MS = { timeout: 2000 };
const WHEEL_ZOOM_DELTA_Y = -200;
const POST_GESTURE_SETTLE_MS = 300;
// A misclassified pinch would seek to a position derived from scrollTop/PPS
// at pinch time — unrelated to elapsed wall-clock and typically off by much
// more than this. Not the spec's stated ±0.1s: real CDP dispatch + browser
// scheduling jitter make that tight a bound flaky for a claim that's really
// "no discontinuous jump", not frame-exact timing (work-issue skill, step 2).
const ENGINE_TIME_DRIFT_TOLERANCE_S = 0.4;

async function getSpectrogramHeightPx(
  page: import('@playwright/test').Page,
): Promise<number> {
  return page
    .locator('.spectrogram')
    .first()
    .evaluate((el) => parseFloat((el as HTMLElement).style.height));
}

async function getMeasurements(
  page: import('@playwright/test').Page,
): Promise<{ heightPx: number; engineTime: number }> {
  const [heightPx, engineTime] = await Promise.all([
    getSpectrogramHeightPx(page),
    getEngineTime(page),
  ]);
  return { heightPx, engineTime };
}

/**
 * Runs `gesture`, asserting the play/pause button made no transitions of
 * its own during it (only the transitions the test's own setup caused,
 * before tracing started, count). Returns the gesture's wall-clock duration
 * for callers that need to reason about expected engine-time progress.
 */
async function runGestureExpectingStablePlayback(
  page: import('@playwright/test').Page,
  gesture: () => Promise<void>,
): Promise<number> {
  await tracePlaybackState(page);
  const start = Date.now();
  await gesture();
  const elapsedMs = Date.now() - start;
  const trace = await stopPlaybackTrace(page);
  expect(trace.length).toBe(NO_TRANSITIONS);
  return elapsedMs;
}

test.describe('Pinch-to-zoom / scrub integration', () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO_10S);
    await expect(page.locator('.timeline__track')).toBeVisible();
    await dismissFullscreenOverlay(page);
  });

  test('pinch during playback zooms without pausing or seeking', async ({
    page,
  }) => {
    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();
    // Confirms the transport is actually advancing (not just that the
    // button flipped) before the baseline measurement below is taken.
    await expect
      .poll(() => getEngineTime(page), ENGINE_TIME_PROGRESSING_POLL_MS)
      .toBeGreaterThan(0);

    const before = await getMeasurements(page);
    const elapsedMs = await runGestureExpectingStablePlayback(page, () =>
      pinchTimeline(page, PINCH_SCALE_OUT),
    );

    await expect(page.getByTitle('Pause')).toBeVisible();
    const after = await getMeasurements(page);

    expect(after.heightPx / before.heightPx).toBeCloseTo(
      PINCH_SCALE_OUT,
      ZOOM_RATIO_PRECISION_DIGITS,
    );

    const drift = after.engineTime - before.engineTime - elapsedMs / 1000;
    expect(Math.abs(drift)).toBeLessThan(ENGINE_TIME_DRIFT_TOLERANCE_S);
  });

  test('pinch while paused zooms without triggering a seek', async ({
    page,
  }) => {
    await expect(page.getByTitle('Play')).toBeVisible();

    const before = await getMeasurements(page);
    await runGestureExpectingStablePlayback(page, () =>
      pinchTimeline(page, PINCH_SCALE_OUT),
    );

    await expect(page.getByTitle('Play')).toBeVisible();
    const after = await getMeasurements(page);

    expect(after.heightPx / before.heightPx).toBeCloseTo(
      PINCH_SCALE_OUT,
      ZOOM_RATIO_PRECISION_DIGITS,
    );
    expect(after.engineTime).toBe(before.engineTime);
  });

  test('Ctrl/Meta+wheel zoom does not enter scrub state', async ({
    page,
  }) => {
    await page.getByTitle('Play').click();
    await expect(page.getByTitle('Pause')).toBeVisible();
    await expect
      .poll(() => getEngineTime(page), ENGINE_TIME_PROGRESSING_POLL_MS)
      .toBeGreaterThan(0);

    const heightBefore = await getSpectrogramHeightPx(page);
    const phantom = page.locator('.scrubber__phantom');
    await phantom.hover();

    await tracePlaybackState(page);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, WHEEL_ZOOM_DELTA_Y);
    await page.keyboard.up('Control');
    await page.waitForTimeout(POST_GESTURE_SETTLE_MS);
    const trace = await stopPlaybackTrace(page);

    expect(trace.length).toBe(NO_TRANSITIONS);
    await expect(page.getByTitle('Pause')).toBeVisible();

    const heightAfter = await getSpectrogramHeightPx(page);
    expect(heightAfter).toBeGreaterThan(heightBefore);
  });
});
