/**
 * Reads state through the dev-only `window.__mawimbi` bridge (mawimbi#480,
 * `src/global.d.ts`/`AudioService.ts`) — worker-produced data (e.g.
 * transcribed melody notes) with no DOM/CSS surface a rect or pixel check
 * could observe. Shared so the sparkle/pulse milestones (spec 003,
 * issues #484/#485) reuse the same poll instead of each re-deriving it.
 */
import type { Page } from '@playwright/test';
import type { MelodyData } from '../../src/features/transcription/MelodyExtractor';
import type {
  SpectrogramStatsCounters,
  TrackSpectrogramStats,
} from '../../src/features/spectrogram/SpectrogramStats';
import { expect } from '../fixtures';

// Measured real transcription at ~6-11s per upload (kb/verification.md);
// timeout stays well under Playwright's 30s default per-test timeout so a
// genuine miss fails with this poll's own diagnostic, not a generic test
// timeout with the assertion mid-flight.
const MELODY_POLL_TIMEOUT_MS = 20_000;
const MELODY_POLL_INTERVAL_MS = 500;

// Full-track CQT analysis has no progressive output yet (spec 006 M1 is the
// measurement harness only — M2 adds chunked emission), so a long fixture's
// analysisComplete flag doesn't flip until the whole track is analysed.
// Generous bound for a 3+ minute fixture in a sandboxed CI environment.
const SPECTROGRAM_STATS_POLL_TIMEOUT_MS = 90_000;
const SPECTROGRAM_STATS_POLL_INTERVAL_MS = 1_000;

export async function getFirstTrackId(page: Page): Promise<string> {
  const trackId = await page
    .locator('.timeline__track')
    .first()
    .getAttribute('data-track-id');
  if (!trackId) throw new Error('track id not found on .timeline__track');
  return trackId;
}

/**
 * Reads the real `Tone.Transport` position (issue #476) — a pinch-zoom test
 * would otherwise have to re-derive it from `scrollTop`/`pixelsPerSecond`,
 * exactly the fragile pixel-math proxy this bridge exists to avoid, and
 * pixelsPerSecond changing mid-gesture is the whole point of that test.
 */
export async function getEngineTime(page: Page): Promise<number> {
  const time = await page.evaluate(() =>
    window.__mawimbi?.playback.getEngineTime(),
  );
  if (time === undefined) {
    throw new Error('window.__mawimbi.playback is unavailable');
  }
  return time;
}

/**
 * Polls until melody extraction has produced at least one note for
 * `trackId`, then returns it. Captures the melody from inside the poll
 * callback itself rather than re-reading it afterwards, so there is no
 * second round-trip and no window where the entry could have changed
 * between the poll succeeding and a follow-up read.
 */
export async function waitForMelody(
  page: Page,
  trackId: string,
): Promise<MelodyData> {
  let melody: MelodyData | undefined;

  await expect
    .poll(
      async () => {
        melody = await page.evaluate(
          (id) => window.__mawimbi?.spectrogramCache.getMelody(id),
          trackId,
        );
        return melody?.notes.length ?? 0;
      },
      { timeout: MELODY_POLL_TIMEOUT_MS, intervals: [MELODY_POLL_INTERVAL_MS] },
    )
    .toBeGreaterThan(0);

  return melody!;
}

/**
 * Reads the spectrogram stats bridge's global counters (mawimbi#538, spec
 * 006 M1) — `windowReads`/`drawCalls`/`mainThreadCqtConstructions`/
 * `previewRenders`. Throws if the bridge is unavailable (DEV-only; e2e
 * always runs against `npm start`, so absence means a real regression).
 */
export async function getSpectrogramCounters(
  page: Page,
): Promise<SpectrogramStatsCounters> {
  const counters = await page.evaluate(() =>
    window.__mawimbi?.spectrogramStats.getCounters(),
  );
  if (!counters) {
    throw new Error('window.__mawimbi.spectrogramStats is unavailable');
  }
  return counters;
}

/**
 * Polls until `trackId`'s spectrogram analysis completes (bridge's
 * `analysisComplete` flag), then returns its final per-track stats. Full
 * analysis of a long fixture has no progressive output before spec 006 M2,
 * so this can take real wall-clock time proportional to the track's
 * duration — callers uploading a multi-minute fixture should expect this
 * poll to dominate the test's runtime.
 */
export async function waitForSpectrogramAnalysisComplete(
  page: Page,
  trackId: string,
): Promise<TrackSpectrogramStats> {
  // Checked once, up front, rather than inside the poll callback below —
  // `expect.poll` retries on a thrown error the same as a false result, so
  // throwing from inside the callback wouldn't actually fail fast; it would
  // just burn the full timeout with a differently-worded error. A real
  // DEV-bridge regression should fail immediately, matching
  // `getSpectrogramCounters`'s behavior, not surface as an unexplained
  // 90-second timeout.
  const bridgeAvailable = await page.evaluate(() =>
    Boolean(window.__mawimbi?.spectrogramStats),
  );
  if (!bridgeAvailable) {
    throw new Error('window.__mawimbi.spectrogramStats is unavailable');
  }

  let stats: TrackSpectrogramStats | undefined;

  await expect
    .poll(
      async () => {
        stats = await page.evaluate(
          (id) => window.__mawimbi?.spectrogramStats.getTrackStats(id),
          trackId,
        );
        return stats?.analysisComplete ?? false;
      },
      {
        timeout: SPECTROGRAM_STATS_POLL_TIMEOUT_MS,
        intervals: [SPECTROGRAM_STATS_POLL_INTERVAL_MS],
      },
    )
    .toBe(true);

  return stats!;
}
