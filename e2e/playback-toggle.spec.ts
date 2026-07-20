import {
  expect,
  test,
  uploadAudioFile,
  LONG_AUDIO_10S,
  touchTap,
  swipeTimeline,
  tracePlaybackState,
  stopPlaybackTrace,
  dismissFullscreenOverlay,
} from './fixtures';

/**
 * Reproductions for the playback/scrub bugs identified in spec 002 (issue
 * #472): a timeline tap during playback restarts playback instead of
 * staying paused (G1), and pressing play after a paused touch-swipe enters
 * a play/pause stutter loop (G2). Fixed in milestone 2 (issue #474) by
 * replacing the scrubber's heuristic scroll-source attribution with the
 * input-driven gesture state machine in `scrubGesture.ts` — these were
 * committed `test.fail()`-annotated in milestone 1 (issue #473) per
 * CLAUDE.md's bug-fix rule and flipped green here.
 *
 * Assertions count play/pause button *transitions* via the flap tracer
 * rather than polling visibility at one instant. A visibility poll can
 * land inside a brief "playing" window and false-pass — or, during the
 * live bug, miss every ~15-40ms visibility window for an entire test
 * timeout and false-fail for the wrong reason, which is why these tests
 * don't poll for the button's title mid-gesture (kb/verification.md,
 * "State-flap bugs need transition traces"). Each test's own triggering
 * click causes exactly one expected transition; MAX_INITIATED_TRANSITIONS
 * allows for it and no more.
 *
 * The `waitForTimeout` calls below are fixed observation windows, not blind
 * waits for a condition: each proves an *absence* of further transitions
 * over a bounded duration, which `expect(...).toPass()`-style polling
 * cannot express (there is no condition to poll for — the claim is that
 * nothing changes).
 */

const TAP_HOLD_DURATIONS_MS = [60, 250];
const POST_TAP_OBSERVATION_MS = 1000;
const POST_SWIPE_SETTLE_MS = 400;
const POST_PLAY_OBSERVATION_MS = 2000;
const MAX_INITIATED_TRANSITIONS = 1;

test.describe('Playback toggle stability', () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO_10S);
    await expect(page.locator('.timeline__track')).toBeVisible();
    await dismissFullscreenOverlay(page);
  });

  for (const holdMs of TAP_HOLD_DURATIONS_MS) {
    test(
      `tapping the timeline during playback pauses and stays paused (${holdMs}ms hold)`,
      async ({ page }) => {
        await page.getByTitle('Play').click();
        await expect(page.getByTitle('Pause')).toBeVisible();

        await tracePlaybackState(page);
        await touchTap(page, holdMs);
        await page.waitForTimeout(POST_TAP_OBSERVATION_MS);
        const trace = await stopPlaybackTrace(page);

        expect(trace.length).toBeLessThanOrEqual(MAX_INITIATED_TRANSITIONS);
      },
    );
  }

  test(
    'pressing play after a paused touch-swipe yields stable playback',
    async ({ page }) => {
      await expect(page.getByTitle('Play')).toBeVisible();

      await swipeTimeline(page, 300);
      await page.waitForTimeout(POST_SWIPE_SETTLE_MS);
      await expect(page.getByTitle('Play')).toBeVisible();

      // Tracing starts before the triggering click (seeded from "Play") so
      // its own Play→Pause switch is captured as the one allowed initiated
      // transition, rather than polling for "Pause" to become visible
      // first — which the live bug's brief visibility windows can miss for
      // the wrong reason (see module comment above).
      await tracePlaybackState(page);
      await page.getByTitle('Play').click();
      await page.waitForTimeout(POST_PLAY_OBSERVATION_MS);
      const trace = await stopPlaybackTrace(page);

      expect(trace.length).toBeLessThanOrEqual(MAX_INITIATED_TRANSITIONS);
    },
  );

  // Issue #475: a scrub during playback pauses immediately and arms a resume
  // for when its ~200ms debounced seek commits (spec 002, C4-C7). If an
  // explicit command intervenes inside that window, it must win — the stale
  // armed resume must not fire once the debounce fires. PlaybackService's
  // command epoch (bumped by every explicit play/pause/stop/rewind/seekTo
  // call) is what lets the scrub controller detect the intervening command
  // and cancel its own resume.
  //
  // Rewind is the intervening command here rather than the Play/Pause
  // toggle: a toggle's effect depends on which state it *reads* right before
  // clicking, so if the stale resume happens to fire in the same instant the
  // toggle click is processed, the two can race and the toggle's outcome
  // becomes ambiguous — a hazard of any toggle control racing a concurrent
  // async transition, unrelated to whether the epoch fix itself works.
  // Rewind has no such ambiguity: it unconditionally forces stopped+0
  // regardless of current state, so it deterministically proves the stale
  // resume never fires, however the timing lands.
  test(
    'an explicit rewind during the scrub debounce window cancels the auto-resume',
    async ({ page }) => {
      await page.getByTitle('Play').click();
      await expect(page.getByTitle('Pause')).toBeVisible();

      await swipeTimeline(page, 300);
      await expect(page.getByTitle('Play')).toBeVisible();

      await page.getByTitle('Rewind').click();

      await page.waitForTimeout(POST_PLAY_OBSERVATION_MS);
      await expect(page.getByTitle('Play')).toBeVisible();
    },
  );
});
