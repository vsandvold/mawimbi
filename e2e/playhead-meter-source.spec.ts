import { expect, test, uploadAudioFile, LONG_AUDIO_10S } from './fixtures';
import {
  getEngineTime,
  getSpectrogramCounters,
  scrubToMiddle,
} from './helpers/mawimbiBridge';

/**
 * Proves the playhead meter's CQT frames come from the audio-thread worklet
 * during playback, not a main-thread `LiveCQTAnalyser` (mawimbi#542, spec
 * 006 milestone 5, Decision 2) — `useScrubberScroll` no longer constructs a
 * bare `FrequencyVisualizer(destination)`; it passes the destination-tapped
 * `WorkletAnalyser` AudioService already taps for loudness metering.
 *
 * The `mainThreadCqtConstructions` bridge counter (mawimbi#538) only
 * increments in `FrequencyVisualizer`'s native fallback path — it should
 * stay at 0 across an ordinary play/pause/scrub session in this
 * environment, where AudioWorklet is supported.
 *
 * "Playhead meter still paints" (the acceptance criterion's other half) is
 * covered by the existing spec 003 suite (`e2e/playhead-effects.spec.ts`)
 * staying green, not re-asserted here: this environment's headless
 * AudioContext (no real output device) never delivers real per-frame
 * worklet data back to either the loudness or CQT path regardless of which
 * one is wired up — a sandbox limitation confirmed to predate this change
 * (the same absence occurs for the pre-existing destination-tapped
 * loudness meter), not a paint regression. Screenshot-decoded bar-height
 * assertions would be unfalsifiable here for that reason; the existing
 * sparkle e2e (driven by transcribed note data, not live frequency
 * magnitudes) is what actually exercises "the draw pipeline still paints".
 */

const ENGINE_TIME_POLL_TIMEOUT_MS = 5_000;

test.describe('Playhead meter frame source', () => {
  test('worklet CQT is used (not the main-thread fallback) across a play/pause/scrub session', async ({
    page,
  }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, LONG_AUDIO_10S);
    await expect(page.locator('.timeline__track')).toBeVisible();

    await page.getByTitle('Play').click();
    await expect
      .poll(async () => getEngineTime(page), {
        timeout: ENGINE_TIME_POLL_TIMEOUT_MS,
        intervals: [20],
      })
      .toBeGreaterThan(0.5);
    await page.getByTitle('Pause').click();

    await scrubToMiddle(page);

    // A second play/pause cycle exercises the visualizer's dispose/recreate
    // path again — a latent fallback would keep incrementing the counter on
    // every cycle, not just the first.
    await page.getByTitle('Play').click();
    await expect
      .poll(async () => getEngineTime(page), {
        timeout: ENGINE_TIME_POLL_TIMEOUT_MS,
        intervals: [20],
      })
      .toBeGreaterThan(0);
    await page.getByTitle('Pause').click();

    const counters = await getSpectrogramCounters(page);
    expect(counters.mainThreadCqtConstructions).toBe(0);

    // Still mounted and drawing something (idle frame at minimum) — the
    // deeper "paints real content" claim is the existing spec 003 e2e's job.
    await expect(page.locator('.scrubber__playhead')).toBeVisible();
  });
});
