import {
  expect,
  test,
  uploadAudioFile,
  LONG_AUDIO_10S,
  touchTap,
  swipeTimeline,
  tracePlaybackState,
  stopPlaybackTrace,
} from './fixtures';

/**
 * Reproductions for the playback/scrub bugs identified in spec 002 (issue
 * #472): a timeline tap during playback restarts playback instead of
 * staying paused (G1), and pressing play after a paused touch-swipe enters
 * a play/pause stutter loop (G2). Both are annotated `test.fail()` per
 * CLAUDE.md's bug-fix rule — they must fail against current behavior before
 * milestone 2's gesture-model fix flips them green.
 *
 * Assertions count play/pause button *transitions* via the flap tracer
 * rather than polling visibility at one instant — a visibility poll can
 * land inside a brief "playing" window and false-pass (kb/verification.md,
 * "State-flap bugs need transition traces").
 */

const TAP_HOLD_DURATIONS_MS = [60, 250];
const POST_TAP_OBSERVATION_MS = 1000;
const POST_SWIPE_SETTLE_MS = 400;
const POST_PLAY_OBSERVATION_MS = 2000;
const MAX_TAP_TRANSITIONS = 1;

test.describe('Playback toggle stability', () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO_10S);
    await expect(page.locator('.timeline__track')).toBeVisible();

    // Dismiss the fullscreen overlay that appears on touch-capable devices
    const dismissButton = page.getByText('Dismiss');
    if (await dismissButton.isVisible()) {
      await dismissButton.click();
    }
    await expect(page.locator('.fullscreen__overlay')).not.toBeVisible();
  });

  for (const holdMs of TAP_HOLD_DURATIONS_MS) {
    test.fail(
      `tapping the timeline during playback pauses and stays paused (${holdMs}ms hold)`,
      async ({ page }) => {
        await page.getByTitle('Play').click();
        await expect(page.getByTitle('Pause')).toBeVisible();

        await tracePlaybackState(page);
        await touchTap(page, holdMs);
        await page.waitForTimeout(POST_TAP_OBSERVATION_MS);
        const trace = await stopPlaybackTrace(page);

        await expect(page.getByTitle('Play')).toBeVisible();
        expect(trace.length).toBeLessThanOrEqual(MAX_TAP_TRANSITIONS);
      },
    );
  }

  test.fail(
    'pressing play after a paused touch-swipe yields stable playback',
    async ({ page }) => {
      await expect(page.getByTitle('Play')).toBeVisible();

      await swipeTimeline(page, 300);
      await page.waitForTimeout(POST_SWIPE_SETTLE_MS);
      await expect(page.getByTitle('Play')).toBeVisible();

      await tracePlaybackState(page);
      await page.getByTitle('Play').click();
      await page.waitForTimeout(POST_PLAY_OBSERVATION_MS);
      const trace = await stopPlaybackTrace(page);

      // The click above is user-initiated and happens before tracing starts,
      // so a stable timeline records zero further transitions.
      expect(trace.length).toBe(0);
    },
  );
});
