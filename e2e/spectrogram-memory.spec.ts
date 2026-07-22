import { expect, test, uploadAudioFile, CHIRP_AUDIO_10S } from './fixtures';
import {
  getFirstTrackId,
  getSpectrogramTrackStats,
  waitForSpectrogramAnalysisComplete,
} from './helpers/mawimbiBridge';

/**
 * Cache lifecycle: releasing raw frames post-persist and wiring eviction
 * (mawimbi#540, spec 006 milestone 3). Proves the bridge stats introduced
 * in M1 actually reach zero once the corresponding lifecycle event fires —
 * frameBytes after a save completes, tileBytes/frameBytes after a track or
 * project goes away — rather than asserting on the wiring in isolation.
 */

test.describe('Spectrogram cache lifecycle', () => {
  test('releases raw frames after save, and clears the cache on project teardown + restores on reopen', async ({
    page,
  }) => {
    await page.goto('/project/memory-teardown-test');
    await uploadAudioFile(page, CHIRP_AUDIO_10S);

    const trackId = await getFirstTrackId(page);
    await waitForSpectrogramAnalysisComplete(page, trackId);

    // Post-persist release (Goal 2): frameBytes settles to 0 once the
    // fire-and-forget `saveSpectrogramData` promise resolves and
    // `releaseFrames` runs — tiles/tileBytes stay put.
    await expect
      .poll(async () => (await getSpectrogramTrackStats(page, trackId))?.frameBytes)
      .toBe(0);
    const beforeTeardown = await getSpectrogramTrackStats(page, trackId);
    expect(beforeTeardown?.tileBytes).toBeGreaterThan(0);

    // Leaving the project unmounts `ProjectPageContent` — `invalidateAll`
    // fires and the evicted track's stats disappear entirely.
    await page.locator('.floating-back-button').click();
    await expect
      .poll(async () => getSpectrogramTrackStats(page, trackId))
      .toBeUndefined();

    // Restore path unaffected: reopening re-reads from IndexedDB and
    // re-tiles, same as before eviction existed.
    await page.locator('.home__project-item').first().click();
    await expect(page).toHaveURL(/\/project\/memory-teardown-test/);
    await expect(page.locator('.spectrogram__canvas')).toBeVisible({
      timeout: 15000,
    });
  });

  test('invalidates the cache entry when undoing a track upload (DELETE_TRACK)', async ({
    page,
  }) => {
    await page.goto('/project/memory-delete-test');
    await uploadAudioFile(page, CHIRP_AUDIO_10S);

    const trackId = await getFirstTrackId(page);
    await waitForSpectrogramAnalysisComplete(page, trackId);

    const before = await getSpectrogramTrackStats(page, trackId);
    expect(before?.tileBytes).toBeGreaterThan(0);

    // Undoing the upload reverses ADD_TRACK to DELETE_TRACK
    // (projectPageReducer.ts) — `useDeleteTrackAudio`'s new `invalidate`
    // call fires as one of that removal's side effects.
    await page.getByTitle('Undo').click();

    await expect
      .poll(async () => getSpectrogramTrackStats(page, trackId))
      .toBeUndefined();
  });
});
