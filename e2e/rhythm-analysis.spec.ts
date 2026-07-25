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
import type { Page } from '@playwright/test';
import { expect, test, uploadAudioFile, CLICK_120BPM_AUDIO } from './fixtures';
import { getFirstTrackId, waitForRhythm } from './helpers/mawimbiBridge';
import { CLICK_120BPM_TIMES } from './fixtures/rhythmGroundTruth.mjs';

const EXPECTED_BPM = 120;
const BPM_TOLERANCE = 2;
const TICK_TOLERANCE_SECONDS = 0.07;
const ONSET_TOLERANCE_SECONDS = 0.05;
const PERSIST_POLL_TIMEOUT_MS = 20_000;
const PERSIST_POLL_INTERVAL_MS = 250;

/**
 * Reads which of a track's IndexedDB rows have actually been committed —
 * the project record (debounced auto-save), the spectrogram, and the rhythm.
 * Polling this replaces a fixed wait before the reload below: the three
 * writes are independent and none of them is what the auto-save debounce
 * times, so a duration calibrated to that debounce is a blind wait
 * (CLAUDE.md's e2e rules, #367/#386) that inverts *both* restore assertions
 * on a slow machine — failing as "rhythm was re-analysed", indistinguishable
 * from a real regression (code review on PR #577).
 */
function readPersistedRows(page: Page, trackId: string) {
  return page.evaluate(
    (id) =>
      new Promise<{ project: boolean; spectrogram: boolean; rhythm: boolean }>(
        (resolve, reject) => {
          const request = indexedDB.open('mawimbi-db');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const stores = ['projects', 'spectrograms', 'rhythms'];
            if (!stores.every((store) => db.objectStoreNames.contains(store))) {
              db.close();
              resolve({ project: false, spectrogram: false, rhythm: false });
              return;
            }
            const tx = db.transaction(stores, 'readonly');
            const projects = tx.objectStore('projects').getAll();
            const spectrogram = tx.objectStore('spectrograms').get(id);
            const rhythm = tx.objectStore('rhythms').get(id);
            tx.oncomplete = () => {
              db.close();
              resolve({
                project: (
                  projects.result as { tracks: { trackId: string }[] }[]
                ).some((saved) =>
                  saved.tracks.some((track) => track.trackId === id),
                ),
                spectrogram: Boolean(spectrogram.result),
                rhythm: Boolean(rhythm.result),
              });
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          };
        },
      ),
    trackId,
  );
}

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

    // Reload only once every row the restore path reads is actually
    // committed — observed directly, not waited out.
    await expect
      .poll(() => readPersistedRows(page, trackId), {
        timeout: PERSIST_POLL_TIMEOUT_MS,
        intervals: [PERSIST_POLL_INTERVAL_MS],
      })
      .toEqual({ project: true, spectrogram: true, rhythm: true });

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
