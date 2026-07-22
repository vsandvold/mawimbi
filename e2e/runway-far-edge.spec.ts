import { expect, test, uploadAudioFile, makeWavFixture } from './fixtures';
import { meanLuminance } from './helpers/pixelDecode';
import { getFirstTrackId, getSpectrogramTrackStats } from './helpers/mawimbiBridge';

/**
 * Runway far-edge fade (mawimbi#468 option 2, spec 006 milestone 4, Goal 7):
 * on a track longer than the runway window, upcoming content used to end in
 * a hard horizontal cut partway up the runway; `drawTilesFrame` now alpha-
 * fades the last `FAR_EDGE_FADE_PX` canvas pixels toward the far edge
 * instead.
 *
 * Verified with the tilt flattened (`reducedMotion: 'reduce'`, the
 * established CLAUDE.md pattern for this environment): under the tilted
 * projection, plane-space distance near the far edge is compressed to a
 * handful of screen pixels by design (that compression is *why* a hard cut
 * there reads as a glitch rather than a design choice per #468) — too few
 * on-screen pixels to sample a reliable luminance trend. Flat mode maps
 * canvas bitmap rows 1:1 to screen pixels, making the fade band's actual
 * screen footprint match `FAR_EDGE_FADE_PX` directly and testable with
 * ordinary band sampling.
 */

const TONE_FIXTURE_SECONDS = 65; // comfortably over the >60s floor
const TONE_FREQUENCY_HZ = 440;
const TILE_POLL_TIMEOUT_MS = 20_000;

const BAND_HEIGHT_PX = 40;
const BAND_COUNT = 7; // spans 0–280px: inside the ~200px fade band, plus clear-of-it bands for contrast
const SAMPLE_WIDTH_PX = 300;
// Background is near-black in the default dark theme (`--background: hsl(0
// 0% 0%)`) — the fade's top band should read close to that, not to the
// tone's own drawn brightness.
const BACKGROUND_DARK_LUMINANCE_CEILING = 30;
// The tone is drawn at a fixed loudness throughout, so once we're clearly
// past the fade band the drawn luminance plateaus — this margin only needs
// to separate "faded near-background" from "full-brightness content".
const FADE_TREND_MARGIN = 25;

async function setUpLongTrack(page: import('@playwright/test').Page) {
  const fixturePath = makeWavFixture([
    {
      kind: 'tone',
      seconds: TONE_FIXTURE_SECONDS,
      frequencyHz: TONE_FREQUENCY_HZ,
    },
  ]);

  await page.goto('/project/test-id');
  await uploadAudioFile(page, fixturePath);

  const trackId = await getFirstTrackId(page);

  // Only the first tile (25.6s, `TILE_FRAMES`) is needed to cover the
  // visible window's upcoming content at time 0 — no need to wait for the
  // whole 65s track to finish analysing (spec 006 M2's progressive tiling).
  await expect
    .poll(
      async () => {
        const stats = await getSpectrogramTrackStats(page, trackId);
        return stats?.tileCount ?? 0;
      },
      { timeout: TILE_POLL_TIMEOUT_MS },
    )
    .toBeGreaterThan(0);

  await page.locator('.floating-toolbar').getByTitle('Rewind').click();
}

async function sampleFadeBandLuminances(
  page: import('@playwright/test').Page,
): Promise<number[]> {
  const canvas = page.locator('.spectrogram__canvas').first();
  await expect(canvas).toBeVisible();
  const rect = await canvas.evaluate((el) => el.getBoundingClientRect().toJSON());
  const centerX = rect.left + rect.width / 2;

  const luminances: number[] = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    const clip = {
      x: centerX - SAMPLE_WIDTH_PX / 2,
      y: rect.top + i * BAND_HEIGHT_PX,
      width: SAMPLE_WIDTH_PX,
      height: BAND_HEIGHT_PX,
    };
    luminances.push(await meanLuminance(page, clip));
  }
  return luminances;
}

test.describe('Runway far-edge fade', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  for (const { name, viewport } of [
    { name: 'desktop', viewport: { width: 1280, height: 800 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    test(`content fades toward the far edge on a >60s track (${name})`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await setUpLongTrack(page);

      const luminances = await sampleFadeBandLuminances(page);
      const [topBand] = luminances;
      const lastBand = luminances[luminances.length - 1];

      // The very top of the canvas — the far edge — reads close to the
      // dark background rather than the tone's full drawn brightness: the
      // fade, not a coincidental lack of content (the track is longer than
      // the window, so real tile content exists there before the fade is
      // applied).
      expect(topBand).toBeLessThan(BACKGROUND_DARK_LUMINANCE_CEILING);

      // A band comfortably past the ~200px fade band shows the tone at
      // full brightness, clearly brighter than the faded top band.
      expect(lastBand - topBand).toBeGreaterThan(FADE_TREND_MARGIN);

      // Trending down toward the far edge: each band is no dimmer than the
      // next one further from the edge (small tolerance for tone-frequency
      // banding noise in the decoded screenshot).
      const NOISE_TOLERANCE = 5;
      for (let i = 0; i < luminances.length - 1; i++) {
        expect(luminances[i]).toBeLessThanOrEqual(
          luminances[i + 1] + NOISE_TOLERANCE,
        );
      }
    });
  }
});
