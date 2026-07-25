import { expect, test, uploadAudioFile, CLICK_120BPM_AUDIO } from './fixtures';
import { CLICK_120BPM } from './fixtures/rhythmGroundTruth.mjs';

/**
 * BPM badge (spec 007 milestone 3, #559) — the drawer's read of the track's
 * tempo estimate. The number itself comes from the rhythm worker pass spec
 * 008 milestone 2 already ships; what this proves is the path from that
 * worker result to a rendered badge: cache → `useTempoSync` →
 * `SET_TRACK_TEMPO` → project state → drawer.
 *
 * Its own file rather than an extra case in `track-effects.spec.ts`: the
 * click fixture is ~17 s of audio, and analysing it alongside that file's
 * CPU-bound pixel assertions starved them badly enough to fail at the local
 * default of 2 workers (CI runs `workers: 1`, so it never saw this). Tests
 * in one file are guaranteed co-scheduled; separate files are not.
 *
 * The "no confident tempo ⇒ no badge" half deliberately lives at cheaper
 * levels: real essentia scores `test-tone-long.wav` at exactly 0 confidence
 * in Vitest (`RhythmAnalyser.fixtures.test.ts`), and the drawer's
 * absent-badge rendering is covered in `EffectsBottomSheet.test.tsx`. A
 * second full upload would re-prove both at the slowest available level.
 */

const DRAWER_ANIMATION_MS = 350;
const BADGE_TIMEOUT_MS = 60_000;
// Measured: essentia reports 119.84 BPM for this fixture. Wide enough not to
// chase the estimator's own precision, tight enough that a half/double-time
// octave error (60/240 BPM) fails loudly.
const BPM_TOLERANCE = 2;

test('a click track shows its estimated BPM in the effects drawer', async ({
  page,
}) => {
  test.setTimeout(BADGE_TIMEOUT_MS + 30_000);

  // Melody extraction contributes nothing here and is the expensive job on
  // the shared spectrogram worker (kb/verification.md, #577) — on a 17 s
  // fixture it delays the rhythm result this test waits for by tens of
  // seconds. Basic Pitch's model is self-hosted, so `fixtures.ts`'s
  // `blockModelRequests` (only `/models/*.onnx`) doesn't reach it; blocking
  // it makes `extractMelodyInWorker` reject, which its caller already
  // handles as a logged warning.
  await page.route('**/basic-pitch-model/**', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );

  await page.goto('/project/test-id');
  await uploadAudioFile(page, CLICK_120BPM_AUDIO);
  await expect(page.locator('.timeline__track')).toHaveCount(1);

  await page.getByTitle('Show effects').click();
  await page.waitForTimeout(DRAWER_ANIMATION_MS);

  // The badge's own appearance is the poll — no fixed settle to calibrate.
  const badge = page.getByTitle('Estimated tempo');
  await expect(badge).toBeVisible({ timeout: BADGE_TIMEOUT_MS });

  const label = (await badge.textContent()) ?? '';
  const bpm = Number(label.replace(' BPM', ''));
  expect(
    Math.abs(bpm - CLICK_120BPM.bpm),
    `badge read "${label}", expected ~${CLICK_120BPM.bpm} BPM`,
  ).toBeLessThanOrEqual(BPM_TOLERANCE);
});
