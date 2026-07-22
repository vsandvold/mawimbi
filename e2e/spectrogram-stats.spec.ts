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
const LONG_FIXTURE_SECONDS = 182;

test.describe('Spectrogram stats bridge', () => {
  test('reports non-zero per-track stats and advancing counters after upload + scroll', async ({
    page,
  }) => {
    const fixturePath = makeWavFixture([
      { kind: 'tone', seconds: 90, frequencyHz: 440 },
      { kind: 'silence', seconds: 90 },
      { kind: 'burst', seconds: 2 },
    ]);

    await page.goto('/project/test-id');
    await uploadAudioFile(page, fixturePath);

    const trackId = await getFirstTrackId(page);
    const trackStats = await waitForSpectrogramAnalysisComplete(page, trackId);

    expect(trackStats.analysisComplete).toBe(true);
    expect(trackStats.tileCount).toBeGreaterThan(0);
    expect(trackStats.tileBytes).toBeGreaterThan(0);
    expect(trackStats.frameBytes).toBeGreaterThan(0);

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
