import type { Page } from '@playwright/test';
import { expect, test, uploadAudioFile, SHORT_AUDIO } from './fixtures';
import {
  getSpectrogramCounters,
  waitForSpectrogramAnalysisComplete,
} from './helpers/mawimbiBridge';

/**
 * TimelineRenderLoop invariants (mawimbi#541, spec 006 milestone 4) — the
 * shared rAF loop that replaced N always-on per-track loops. Each mounted
 * track used to call the window-geometry read (`getCanvasWindow`) itself
 * every frame regardless of whether anything changed; these tests pin down
 * the two properties that fix that: a genuinely idle frame (nothing
 * scrolled, no track's tiles changed) costs zero window reads and zero
 * draw calls, and an active (scrolling) frame costs at most one window
 * read — not once per mounted track.
 */

const TRACK_COUNT = 3;
const IDLE_FRAME_COUNT = 60;
const SCROLL_DURATION_MS = 500;
const MS_PER_FRAME_60FPS = 1000 / 60;
// Generous slack for scheduling jitter between the test's own rAF-driven
// scroll loop and the app's TimelineRenderLoop — both run at ~60fps but are
// independent loops, so a few frames of drift either way is expected, not a
// regression.
const FRAME_TOLERANCE = 8;

async function getAllTrackIds(page: Page): Promise<string[]> {
  return page.locator('.timeline__track').evaluateAll((els) =>
    els
      .map((el) => el.getAttribute('data-track-id'))
      .filter((id): id is string => Boolean(id)),
  );
}

async function uploadTracksAndWaitForAnalysis(
  page: Page,
  count: number,
): Promise<void> {
  await page.goto('/project/test-id');
  for (let i = 0; i < count; i++) {
    await uploadAudioFile(page, SHORT_AUDIO);
  }
  await expect(page.locator('.timeline__track')).toHaveCount(count);

  const trackIds = await getAllTrackIds(page);
  for (const trackId of trackIds) {
    await waitForSpectrogramAnalysisComplete(page, trackId);
  }
}

/** Waits for exactly `frameCount` of the page's own animation frames to
 * elapse — used as the idle test's "nothing happened for N frames" window. */
async function waitForAnimationFrames(
  page: Page,
  frameCount: number,
): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let remaining = count;
        function tick() {
          remaining--;
          if (remaining <= 0) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
    frameCount,
  );
}

/** Continuously nudges the phantom scroller's scrollTop for `durationMs`,
 * once per animation frame — a lightweight stand-in for a real scroll
 * gesture that still fires native `scroll` events each tick. */
async function scrollContinuouslyFor(
  page: Page,
  durationMs: number,
): Promise<void> {
  await page.evaluate(
    (duration) =>
      new Promise<void>((resolve) => {
        const phantom = document.querySelector(
          '.scrubber__phantom',
        ) as HTMLElement | null;
        if (!phantom) {
          resolve();
          return;
        }
        const startScrollTop = phantom.scrollTop;
        const startTime = performance.now();
        function tick() {
          const elapsed = performance.now() - startTime;
          phantom.scrollTop = Math.max(0, startScrollTop - elapsed);
          if (elapsed >= duration) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
    durationMs,
  );
}

test.describe('TimelineRenderLoop', () => {
  test('an idle 60-frame window performs no window reads or draw calls', async ({
    page,
  }) => {
    await uploadTracksAndWaitForAnalysis(page, TRACK_COUNT);

    const before = await getSpectrogramCounters(page);

    await waitForAnimationFrames(page, IDLE_FRAME_COUNT);

    const after = await getSpectrogramCounters(page);
    expect(after.windowReads - before.windowReads).toBe(0);
    expect(after.drawCalls - before.drawCalls).toBe(0);
  });

  test('scrolling costs at most one window read per elapsed frame, not one per track', async ({
    page,
  }) => {
    await uploadTracksAndWaitForAnalysis(page, TRACK_COUNT);

    const before = await getSpectrogramCounters(page);

    await scrollContinuouslyFor(page, SCROLL_DURATION_MS);

    const after = await getSpectrogramCounters(page);
    const windowReadsDuringScroll = after.windowReads - before.windowReads;
    const maxAllowedFrames =
      Math.ceil(SCROLL_DURATION_MS / MS_PER_FRAME_60FPS) + FRAME_TOLERANCE;

    expect(windowReadsDuringScroll).toBeGreaterThan(0);
    expect(windowReadsDuringScroll).toBeLessThanOrEqual(maxAllowedFrames);
  });
});
