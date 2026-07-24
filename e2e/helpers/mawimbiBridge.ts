/**
 * Reads state through the dev-only `window.__mawimbi` bridge (mawimbi#480,
 * `src/global.d.ts`/`AudioService.ts`) — worker-produced data (e.g.
 * transcribed melody notes) with no DOM/CSS surface a rect or pixel check
 * could observe. Shared so the sparkle/pulse milestones (spec 003,
 * issues #484/#485) reuse the same poll instead of each re-deriving it.
 */
import type { Page } from '@playwright/test';
import type { MelodyData } from '../../src/features/transcription/MelodyExtractor';
import type { RhythmData } from '../../src/features/rhythm/RhythmAnalyser';
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

// Rhythm extraction runs essentia's RhythmExtractor2013 + OnsetRate as one
// worker round-trip (spec 008 milestone 1) — not yet measured against a
// production-length fixture, so this starts generous like melody's.
const RHYTHM_POLL_TIMEOUT_MS = 20_000;
const RHYTHM_POLL_INTERVAL_MS = 500;

// Analysis is chunked (spec 006 M2): tileCount grows well before this flag
// flips, but the flag itself still only flips once the whole track has been
// analysed. Generous bound for a 3+ minute fixture in a sandboxed CI
// environment.
const SPECTROGRAM_STATS_POLL_TIMEOUT_MS = 90_000;
const SPECTROGRAM_STATS_POLL_INTERVAL_MS = 1_000;

/**
 * Scrolls the phantom scroller to its vertical midpoint — a lightweight way
 * to exercise scroll-driven redraws without simulating a real drag gesture.
 * Shared by spectrogram-stats.spec.ts and playhead-meter-source.spec.ts.
 */
export async function scrubToMiddle(page: Page): Promise<void> {
  const phantom = page.locator('.scrubber__phantom');
  const maxScrollTop = await phantom.evaluate(
    (el) => el.scrollHeight - el.clientHeight,
  );
  await phantom.evaluate((el, pos) => {
    el.scrollTop = pos;
  }, Math.floor(maxScrollTop / 2));
}

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
 * Polls until rhythm extraction has produced at least one tick for
 * `trackId`, then returns it — the rhythm analog of `waitForMelody`, same
 * capture-inside-the-poll shape (no second round trip after the poll
 * succeeds).
 */
export async function waitForRhythm(
  page: Page,
  trackId: string,
): Promise<RhythmData> {
  let rhythm: RhythmData | undefined;

  await expect
    .poll(
      async () => {
        rhythm = await page.evaluate(
          (id) => window.__mawimbi?.spectrogramCache.getRhythm(id),
          trackId,
        );
        return rhythm?.ticks.length ?? 0;
      },
      { timeout: RHYTHM_POLL_TIMEOUT_MS, intervals: [RHYTHM_POLL_INTERVAL_MS] },
    )
    .toBeGreaterThan(0);

  return rhythm!;
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
 * Reads `trackId`'s current spectrogram stats, or `undefined` if the cache
 * has no entry for it (mawimbi#540, spec 006 M3) — used to confirm
 * `invalidate`/`invalidateAll` actually cleared a track's accounting,
 * unlike `waitForSpectrogramAnalysisComplete`, which polls for the
 * opposite (a populated, complete entry).
 */
export async function getSpectrogramTrackStats(
  page: Page,
  trackId: string,
): Promise<TrackSpectrogramStats | undefined> {
  const bridgeAvailable = await page.evaluate(() =>
    Boolean(window.__mawimbi?.spectrogramStats),
  );
  if (!bridgeAvailable) {
    throw new Error('window.__mawimbi.spectrogramStats is unavailable');
  }
  return page.evaluate(
    (id) => window.__mawimbi?.spectrogramStats.getTrackStats(id),
    trackId,
  );
}

/**
 * Polls until `trackId`'s spectrogram analysis fully completes (bridge's
 * `analysisComplete` flag), then returns its final per-track stats.
 * Analysis is chunked (spec 006 M2) so `tileCount` grows well before this
 * resolves — use `sampleSpectrogramTileGrowth` to observe that instead —
 * but the flag itself only flips once the whole track has been analysed,
 * so this can still take real wall-clock time proportional to the track's
 * duration for a long fixture.
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

/**
 * Samples `trackId`'s spectrogram stats repeatedly (mawimbi#539, spec 006
 * milestone 2's progressive-tiling proof) until `analysisComplete` flips,
 * returning every recorded sample in arrival order (including the final,
 * complete one). Built on `expect.poll` — same idiom as
 * `waitForSpectrogramAnalysisComplete` above, just pushing each sample
 * into a closure-captured array from inside the poll callback instead of
 * only keeping the last one (review fix, mawimbi#539: an earlier version
 * hand-rolled this with a raw loop and `page.waitForTimeout`, duplicating
 * `expect.poll`'s own cadence/timeout handling and violating CLAUDE.md's
 * e2e "No blind waits" rule).
 *
 * `getTrackStats` legitimately returns `undefined` for a brief real window
 * right after upload — `recordAnalysisStart` runs before the first chunk's
 * `recordEntry` does, so there's no per-track entry yet — those ticks are
 * skipped rather than recorded or treated as a bridge failure. The bridge
 * object itself missing entirely (a real regression, not a timing gap) is
 * checked once up front, matching `waitForSpectrogramAnalysisComplete`.
 */
export async function sampleSpectrogramTileGrowth(
  page: Page,
  trackId: string,
): Promise<TrackSpectrogramStats[]> {
  const bridgeAvailable = await page.evaluate(() =>
    Boolean(window.__mawimbi?.spectrogramStats),
  );
  if (!bridgeAvailable) {
    throw new Error('window.__mawimbi.spectrogramStats is unavailable');
  }

  const samples: TrackSpectrogramStats[] = [];

  await expect
    .poll(
      async () => {
        const stats = await page.evaluate(
          (id) => window.__mawimbi?.spectrogramStats.getTrackStats(id),
          trackId,
        );
        if (stats) samples.push(stats);
        return stats?.analysisComplete ?? false;
      },
      {
        timeout: SPECTROGRAM_STATS_POLL_TIMEOUT_MS,
        intervals: [SPECTROGRAM_STATS_POLL_INTERVAL_MS],
      },
    )
    .toBe(true);

  return samples;
}
