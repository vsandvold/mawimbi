import {
  expect,
  test,
  uploadAudioFile,
  EARLY_BURST_AUDIO_14S,
} from './fixtures';
import {
  getFirstTrackId,
  waitForSpectrogramAnalysisComplete,
} from './helpers/mawimbiBridge';

/**
 * Regression for mawimbi#554: `Tone.Offline()` (used by
 * `renderTrackOffline`/`renderTrackOfflineWindow` — the effects-refresh and
 * live-preview pipelines) implements itself by mutating the
 * process-global "current context" (`Tone.setContext()`) for the duration
 * of its callback, then restoring whatever context was current *when that
 * call started* — not a real save/restore stack
 * (`node_modules/tone/Tone/core/context/Offline.ts`). The live-effects-
 * preview scheduler (`effectsPreview.ts`) fires a new offline render every
 * ~150ms while a slider is dragged, and each render takes 1-5+ seconds to
 * resolve — so overlapping `Tone.Offline()` calls are the norm for any
 * drag longer than about a second, not a rare edge case. When a
 * later-started call's render finishes *after* an earlier one's, its
 * restore overwrites the correct live context with the earlier call's
 * already-rendered, defunct `OfflineContext` — permanently stranding the
 * process-global context for the rest of the session. Everything that
 * reads `Tone.getContext()`/`Tone.getDestination()`/`Tone.getTransport()`
 * afterward (not just this feature) then operates against a dead context.
 *
 * Confirmed against the real (unmocked) Tone.js build: this exact test
 * fails — `debugGetGlobalContextName()` reports `'OfflineContext'` instead
 * of the live app's `'Context'` — against the pre-fix `renderTrackOffline`
 * (`Tone.Offline()`'s global-context-swap pattern); it passes against the
 * fix (`new Tone.OfflineContext(...)` built manually, with every node's
 * `context` passed explicitly, never touching the global at all).
 *
 * The uploaded fixture has a single, sharply-localized noise burst near
 * the *start* of an otherwise-silent 14s track (deliberately asymmetric,
 * not mirrored front/back) — a reversed time axis would move the
 * committed spectrogram's energy from an early time-bucket to a late one,
 * unambiguous unlike a symmetric two-burst fixture.
 */

const DRAG_STEP_DELAY_MS = 500;
const DRAG_WAYPOINTS = [0.3, 0.7, 0.2, 0.9, 0.5, 1.0, 0.6, 0.85];
const BUCKETS = 20;
const EARLY_BUCKET_CEILING = 6;

async function energyProfile(
  page: import('@playwright/test').Page,
  trackId: string,
): Promise<number[] | null> {
  return page.evaluate(
    ({ id, buckets }) => {
      const entry = window.__mawimbi?.spectrogramCache.getEntry(id);
      if (!entry) return null;
      const TILE_FRAMES = 1024;
      const totalFrames = entry.data.totalFrames;
      const bucketEnergy = new Array(buckets).fill(0);
      const bucketCount = new Array(buckets).fill(0);
      for (let t = 0; t < entry.tiles.length; t++) {
        const tile = entry.tiles[t];
        const canvas = new OffscreenCanvas(tile.width, tile.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(tile, 0, 0);
        const img = ctx.getImageData(0, 0, tile.width, tile.height);
        const rowFrameBase = t * TILE_FRAMES;
        for (let row = 0; row < tile.height; row++) {
          const frameIdx = rowFrameBase + row;
          if (frameIdx >= totalFrames) break;
          const bucket = Math.min(
            buckets - 1,
            Math.floor((frameIdx / totalFrames) * buckets),
          );
          let rowSum = 0;
          const rowOffset = row * tile.width * 4;
          for (let col = 0; col < tile.width; col++) {
            const i = rowOffset + col * 4;
            rowSum +=
              img.data[i] + img.data[i + 1] + img.data[i + 2] + img.data[i + 3];
          }
          bucketEnergy[bucket] += rowSum;
          bucketCount[bucket]++;
        }
      }
      return bucketEnergy.map((e, i) =>
        bucketCount[i] > 0 ? e / bucketCount[i] : 0,
      );
    },
    { id: trackId, buckets: BUCKETS },
  );
}

function peakBucket(profile: number[]): number {
  let maxIdx = 0;
  for (let i = 1; i < profile.length; i++) {
    if (profile[i] > profile[maxIdx]) maxIdx = i;
  }
  return maxIdx;
}

test.describe('Effects offline render context isolation', () => {
  test('a slow multi-second effects drag during playback never strands the global Tone context, and the committed spectrogram stays directionally correct', async ({
    page,
  }) => {
    await page.goto('/project/test-id');
    await uploadAudioFile(page, EARLY_BURST_AUDIO_14S);
    await expect(page.locator('.timeline__track')).toHaveCount(1);

    const trackId = await getFirstTrackId(page);
    await waitForSpectrogramAnalysisComplete(page, trackId);
    await page.waitForTimeout(500);

    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(window.__mawimbi?.debugGetGlobalContextName),
        ),
      )
      .toBe(true);
    const liveContextName = await page.evaluate(() =>
      window.__mawimbi!.debugGetGlobalContextName(),
    );
    expect(liveContextName).not.toBe('OfflineContext');

    const baseline = await energyProfile(page, trackId);
    expect(baseline).not.toBeNull();
    expect(peakBucket(baseline!)).toBeLessThan(EARLY_BUCKET_CEILING);

    await page.getByTitle('Show effects').click();
    await page.waitForTimeout(350);
    await page.locator('.floating-toolbar').getByTitle('Rewind').click();
    await page.getByTitle('Play').click();

    const thumb = page.getByRole('slider', { name: 'Space amount' });
    const track = thumb.locator('xpath=../../span[@data-slot="slider-track"]');
    const box = await track.boundingBox();
    if (!box) throw new Error('Space slider track not found');
    const y = box.y + box.height / 2;

    // Slow, continuous, human-like drag over several real seconds — long
    // enough that many preview ticks (one per ~150ms) overlap with each
    // other's 1-5s render+analyse duration, reproducing the overlapping
    // Tone.Offline() calls this test guards against. Wanders back and
    // forth rather than moving monotonically, closer to a real drag.
    await page.mouse.move(box.x, y);
    await page.mouse.down();
    for (const frac of DRAG_WAYPOINTS) {
      await page.mouse.move(box.x + box.width * frac, y, { steps: 5 });
      await page.waitForTimeout(DRAG_STEP_DELAY_MS);
    }
    await page.mouse.up();

    await expect
      .poll(
        () =>
          page.evaluate(
            (id) =>
              window.__mawimbi?.spectrogramCache.getEntry(id)
                ?.effectsParamsHash,
            trackId,
          ),
        { timeout: 20_000 },
      )
      .not.toBeUndefined();
    await page.waitForTimeout(1000);

    const finalContextName = await page.evaluate(() =>
      window.__mawimbi!.debugGetGlobalContextName(),
    );
    expect(finalContextName).toBe(liveContextName);
    expect(finalContextName).not.toBe('OfflineContext');

    const profile = await energyProfile(page, trackId);
    expect(profile).not.toBeNull();
    expect(peakBucket(profile!)).toBeLessThan(EARLY_BUCKET_CEILING);
  });
});
