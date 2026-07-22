import { expect, test, uploadAudioFile, makeWavFixture } from './fixtures';
import {
  getFirstTrackId,
  getSpectrogramCounters,
  waitForSpectrogramAnalysisComplete,
} from './helpers/mawimbiBridge';

/**
 * Smoke test for the spectrogram stats DEV bridge (mawimbi#538, spec 006
 * milestone 1) — the measurement harness later milestones' verification
 * depends on. Proves the bridge reports real numbers end-to-end (not just
 * that it exists) and that `makeWavFixture` can generate a long (≥180s)
 * fixture, without committing a multi-MB file.
 *
 * A single ≥180s fixture serves both intents in the issue's acceptance
 * criteria — exercising the bridge end-to-end and proving the long-duration
 * generation path — rather than uploading two separate long tracks in one
 * spec.
 */

// Comfortably over the ≥180s floor; segmented so the fixture exercises tone,
// silence, and burst content in one track (per makeWavFixture's segment
// design) rather than a single uniform tone.
const TONE_SEGMENT_SECONDS = 90;
const SILENCE_SEGMENT_SECONDS = 90;
const BURST_SEGMENT_SECONDS = 2;
const TONE_FREQUENCY_HZ = 440;

test.describe('Spectrogram stats bridge', () => {
  test('reports non-zero per-track stats and advancing counters after upload + scroll', async ({
    page,
  }) => {
    const fixturePath = makeWavFixture([
      { kind: 'tone', seconds: TONE_SEGMENT_SECONDS, frequencyHz: TONE_FREQUENCY_HZ },
      { kind: 'silence', seconds: SILENCE_SEGMENT_SECONDS },
      { kind: 'burst', seconds: BURST_SEGMENT_SECONDS },
    ]);

    await page.goto('/project/test-id');
    await uploadAudioFile(page, fixturePath);

    const trackId = await getFirstTrackId(page);
    const trackStats = await waitForSpectrogramAnalysisComplete(page, trackId);

    expect(trackStats.analysisComplete).toBe(true);
    expect(trackStats.tileCount).toBeGreaterThan(0);
    expect(trackStats.tileBytes).toBeGreaterThan(0);
    // frameBytes is deliberately *not* asserted > 0 here: spec 006 M3
    // (mawimbi#540) releases a track's raw frames shortly after its
    // spectrogram persists, racing this poll's read of `analysisComplete`.
    // `spectrogram-memory.spec.ts` covers the post-persist release
    // invariant (frameBytes settling to 0) directly.

    const spectrogramCanvas = page.locator('.spectrogram__canvas');
    await expect(spectrogramCanvas).toBeVisible();

    const before = await getSpectrogramCounters(page);

    const phantom = page.locator('.scrubber__phantom');
    const maxScrollTop = await phantom.evaluate(
      (el) => el.scrollHeight - el.clientHeight,
    );
    await phantom.evaluate((el, pos) => {
      el.scrollTop = pos;
    }, Math.floor(maxScrollTop / 2));

    await expect
      .poll(async () => {
        const after = await getSpectrogramCounters(page);
        return (
          after.windowReads > before.windowReads &&
          after.drawCalls > before.drawCalls
        );
      })
      .toBe(true);
  });
});
