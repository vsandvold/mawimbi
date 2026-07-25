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
// Project auto-save debounce (250 ms) plus buffer, matching
// persistence.spec.ts.
const AUTO_SAVE_WAIT_MS = 500;

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

  // Spec 008 milestone 2 (#568): the `rhythms` store. Re-analysis is
  // deterministic, so identical values after a reload prove nothing on their
  // own — the discriminator is *which path ran*, read from the two mutually
  // exclusive logs the restore and extract branches emit.
  test('rhythm data survives a reload and is restored, not re-analysed', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/project/test-id');
    await uploadAudioFile(page, CLICK_120BPM_AUDIO);
    await expect(page.locator('.timeline__track')).toBeVisible();

    const trackId = await getFirstTrackId(page);
    const analysed = await waitForRhythm(page, trackId);

    // The rhythm row is written from the worker-completion callback and the
    // project record by a debounced auto-save; both are already in flight by
    // the time the bridge exposes rhythm data, so wait for the project's own
    // save to settle before pulling the page out from under them.
    await page.waitForTimeout(AUTO_SAVE_WAIT_MS);

    const rhythmLogs: string[] = [];
    page.on('console', (message) => {
      const text = message.text();
      if (text.startsWith('[rhythm]')) rhythmLogs.push(text);
    });

    await page.reload();
    await expect(page.locator('.timeline__track')).toBeVisible({
      timeout: 20_000,
    });

    const restored = await waitForRhythm(page, trackId);
    expect(restored).toEqual(analysed);

    expect(
      rhythmLogs.filter((log) => log.includes('Restored cached rhythm')),
      `expected a restore log after reload (saw: ${JSON.stringify(rhythmLogs)})`,
    ).not.toHaveLength(0);
    expect(
      rhythmLogs.filter((log) => log.includes('Sending rhythm extraction')),
      `rhythm was re-analysed after reload instead of restored (saw: ${JSON.stringify(rhythmLogs)})`,
    ).toHaveLength(0);
  });
});
