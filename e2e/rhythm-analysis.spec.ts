/**
 * Proving e2e for spec 008 milestone 1 (#567): uploads the 120 BPM click
 * fixture and reads real essentia analysis output through the
 * `window.__mawimbi` bridge — the full analysis→cache→bridge data path,
 * end to end, before any rendering feature exists. Ground-truth click times
 * and tolerances match the spec's verification design table (Goal 1) and
 * the empirical shape-validation findings recorded in kb/decisions.md
 * (2026-07-24): essentia's beat tracker doesn't tag the very first click
 * (it needs one interval to lock phase) and extrapolates ~1 beat past the
 * last one, so this asserts "every real click but the first has a close
 * detected tick" rather than a literal one-to-one match.
 */
import { expect, test, uploadAudioFile, CLICK_120BPM_AUDIO } from './fixtures';
import { getFirstTrackId, waitForRhythm } from './helpers/mawimbiBridge';
import { CLICK_120BPM_TIMES } from './fixtures/rhythmGroundTruth.mjs';

const EXPECTED_BPM = 120;
const BPM_TOLERANCE = 2;
const TICK_TOLERANCE_SECONDS = 0.07;
const ONSET_TOLERANCE_SECONDS = 0.05;

function closestDistance(times: number[], target: number): number {
  return Math.min(...times.map((t) => Math.abs(t - target)));
}

test.describe('Rhythm analysis proof', () => {
  test('uploading the click fixture produces real rhythm data through the bridge', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await page.goto('/project/test-id');
    await uploadAudioFile(page, CLICK_120BPM_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    const trackId = await getFirstTrackId(page);
    const rhythm = await waitForRhythm(page, trackId);

    expect(Math.abs(rhythm.bpm - EXPECTED_BPM)).toBeLessThanOrEqual(
      BPM_TOLERANCE,
    );
    expect(rhythm.confidence).toBeGreaterThan(0);

    // Every real click but the first has a detected tick within tolerance
    // (kb/decisions.md, 2026-07-24: the beat tracker doesn't tag the very
    // first beat — it needs to observe one interval to lock phase).
    for (const truthTime of CLICK_120BPM_TIMES.slice(1)) {
      const distance = closestDistance(rhythm.ticks, truthTime);
      expect(
        distance,
        `no detected tick within ${TICK_TOLERANCE_SECONDS}s of ground-truth click at ${truthTime}s (ticks: ${JSON.stringify(rhythm.ticks)})`,
      ).toBeLessThanOrEqual(TICK_TOLERANCE_SECONDS);
    }

    // OnsetRate matched every click exactly in shape validation (32/32) —
    // assert the same count and per-click accuracy here.
    expect(rhythm.onsets).toHaveLength(CLICK_120BPM_TIMES.length);
    for (const truthTime of CLICK_120BPM_TIMES) {
      const distance = closestDistance(rhythm.onsets, truthTime);
      expect(
        distance,
        `no detected onset within ${ONSET_TOLERANCE_SECONDS}s of ground-truth click at ${truthTime}s (onsets: ${JSON.stringify(rhythm.onsets)})`,
      ).toBeLessThanOrEqual(ONSET_TOLERANCE_SECONDS);
    }
  });
});
