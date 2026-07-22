import { expect, test, uploadAudioFile, makeWavFixture } from './fixtures';
import {
  getFirstTrackId,
  sampleSpectrogramTileGrowth,
} from './helpers/mawimbiBridge';

/**
 * Progressive analysis proof (mawimbi#539, spec 006 milestone 2, Goal 1):
 * tiles become visible incrementally during analysis instead of only after
 * the whole track finishes. Reuses the M1 stats bridge
 * (spectrogram-stats.spec.ts) — data reads, not pixels (kb/verification.md)
 * — to observe `tileCount` growing across multiple deliveries and to read
 * `firstTileMs` directly rather than deriving it from sampling cadence.
 */

// Long enough to span several of the new 25.6s (TILE_FRAMES=1024) tiles —
// same segment shape as the M1 smoke test's fixture.
const TONE_SEGMENT_SECONDS = 90;
const SILENCE_SEGMENT_SECONDS = 90;
const BURST_SEGMENT_SECONDS = 2;
const TONE_FREQUENCY_HZ = 440;

// Issue #539's acceptance bound: generous, sandbox-safe, and — the whole
// point of chunking — independent of the fixture's ~3 minute duration.
const FIRST_TILE_MS_BOUND = 15_000;

test.describe('Progressive spectrogram analysis', () => {
  test('tileCount grows across multiple deliveries before analysis completes, with a fast first tile', async ({
    page,
  }) => {
    const fixturePath = makeWavFixture([
      {
        kind: 'tone',
        seconds: TONE_SEGMENT_SECONDS,
        frequencyHz: TONE_FREQUENCY_HZ,
      },
      { kind: 'silence', seconds: SILENCE_SEGMENT_SECONDS },
      { kind: 'burst', seconds: BURST_SEGMENT_SECONDS },
    ]);

    await page.goto('/project/test-id');
    await uploadAudioFile(page, fixturePath);

    const trackId = await getFirstTrackId(page);
    const samples = await sampleSpectrogramTileGrowth(page, trackId);

    const finalStats = samples[samples.length - 1];
    expect(finalStats.analysisComplete).toBe(true);

    // tileCount only ever accumulates within one analysis.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].tileCount).toBeGreaterThanOrEqual(
        samples[i - 1].tileCount,
      );
    }

    // At least two distinct tileCount values were observed strictly before
    // completion — proof tiles arrived incrementally, not all at once.
    const distinctBeforeComplete = new Set(
      samples.slice(0, -1).map((s) => s.tileCount),
    );
    expect(distinctBeforeComplete.size).toBeGreaterThanOrEqual(2);

    expect(finalStats.firstTileMs).toBeGreaterThan(0);
    expect(finalStats.firstTileMs).toBeLessThanOrEqual(FIRST_TILE_MS_BOUND);
  });
});
