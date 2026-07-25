/**
 * Beat rungs on the runway (spec 008 milestone 3, #569) — does the induced
 * beat grid actually render, at the right places, and only when there is a
 * confident anchor.
 *
 * Reduced motion flattens the runway's perspective (`scale(s) = 1`
 * everywhere, kb/domain.md), so a mark at project time `t` renders at
 * screen `Y = contentBoundaryY − t × pixelsPerSecond`, where
 * `contentBoundaryY` is the on-screen bottom edge of `.timeline__track` —
 * the time-0 boundary the existing runway suite already measures the same
 * way (`runway-geometry.spec.ts`). Every predicted Y below comes from that
 * one measurement, so these assertions test the rungs' agreement with the
 * *track content's own* coordinate system rather than re-deriving the
 * runway's geometry independently.
 *
 * Two levels, deliberately:
 *
 * - **The overlay canvas's own backing store** (`getImageData`) carries the
 *   per-rung geometry claims. It is the only reading that can attribute a
 *   painted row to *this* renderer: a beat grid coincides with the music's
 *   own transients by construction, so on the click fixtures a composited
 *   screenshot cannot tell a rung apart from the click's own spectrogram
 *   row at the same Y. That is a property of rhythm, not of these fixtures
 *   — no fixture can avoid it.
 * - **Decoded screenshot pixels** carry the "does it actually paint"
 *   claim (kb/verification.md level 3: rect-based checks pass straight
 *   through a clipped or mispositioned canvas). Those run in the fixture's
 *   tail, past the last click, where the grid's final points sit over
 *   near-silence and the rung is unambiguously the only bright row.
 */
import {
  ACCELERANDO_CLICK_AUDIO,
  ARRHYTHMIC_NOISE_AUDIO,
  CLICK_120BPM_AUDIO,
  expect,
  test,
  uploadAudioFile,
} from './fixtures';
import { getFirstTrackId } from './helpers/mawimbiBridge';
import { MIN_TEMPO_CONFIDENCE } from '../src/features/rhythm/tempo';
import { decodeClip, hasHorizontalLineAtRow } from './helpers/pixelDecode';
import { induceBeatGrid } from '../src/features/rhythm/induceBeatGrid';
import { DEFAULT_PIXELS_PER_SECOND } from '../src/features/workstation/workstationSignals';
import { CLICK_120BPM } from './fixtures/rhythmGroundTruth.mjs';

const PPS = DEFAULT_PIXELS_PER_SECOND;
const ANALYSIS_TIMEOUT_MS = 45_000;
const ANALYSIS_POLL_INTERVAL_MS = 250;
const SEEK_SETTLE_TIMEOUT_MS = 10_000;

/** The issue's stated placement tolerance for a rendered rung. */
const RUNG_TOLERANCE_PX = 2;

/**
 * essentia's beat tracker is accurate to ~70 ms against the fixture's real
 * clicks (`rhythm-analysis.spec.ts` uses the same bound), and the induced
 * grid inherits that phase — so this is how close a *rendered* rung can be
 * expected to sit to a ground-truth beat, independent of any of this
 * feature's own code.
 */
const GROUND_TRUTH_TOLERANCE_PX = 0.07 * PPS;

type RunwayGeometry = {
  /** Screen Y of project time 0 — `.timeline__track`'s bottom edge. */
  contentBoundaryY: number;
  /** Screen Y of the playhead line. Above it is the anticipation strip. */
  playheadLineY: number;
  canvasTop: number;
  canvasHeight: number;
};

/**
 * Rows of the rhythm overlay's own canvas that are painted across
 * essentially their whole width — i.e. rungs, read from the canvas the
 * renderer drew on rather than from the composited page.
 *
 * Returns each contiguous run's alpha-weighted centre, so a 1.5 px rung
 * anti-aliased across two rows reports one sub-pixel position rather than
 * two neighbouring integers.
 */
async function readRungRows(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(
      '.timeline__rhythm-canvas',
    ) as HTMLCanvasElement | null;
    if (!canvas || canvas.width === 0) return [];
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const rows: { y: number; alpha: number }[] = [];
    for (let y = 0; y < canvas.height; y++) {
      let painted = 0;
      let alphaSum = 0;
      for (let x = 0; x < canvas.width; x++) {
        const alpha = data[(y * canvas.width + x) * 4 + 3];
        if (alpha > 0) painted++;
        alphaSum += alpha;
      }
      if (painted / canvas.width > 0.9) {
        rows.push({ y, alpha: alphaSum / canvas.width });
      }
    }

    const centres: number[] = [];
    let run: { y: number; alpha: number }[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const weight = run.reduce((total, row) => total + row.alpha, 0);
      centres.push(
        run.reduce((total, row) => total + row.y * row.alpha, 0) / weight,
      );
      run = [];
    };
    for (const row of rows) {
      if (run.length > 0 && row.y !== run[run.length - 1].y + 1) flush();
      run.push(row);
    }
    flush();
    return centres;
  });
}

function readGeometry(
  page: import('@playwright/test').Page,
): Promise<RunwayGeometry> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.timeline__rhythm-canvas')!;
    const canvasRect = canvas.getBoundingClientRect();
    return {
      contentBoundaryY: document
        .querySelector('.timeline__track')!
        .getBoundingClientRect().bottom,
      playheadLineY: document
        .querySelector('.scrubber__playhead')!
        .getBoundingClientRect().bottom,
      canvasTop: canvasRect.top,
      canvasHeight: canvasRect.height,
    };
  });
}

/** Screen Y at which a mark at project time `t` must render. */
function screenYForTime(geometry: RunwayGeometry, time: number): number {
  return geometry.contentBoundaryY - time * PPS;
}

async function uploadAndAnalyse(
  page: import('@playwright/test').Page,
  fixture: string,
): Promise<string> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/project/test-id');
  await uploadAudioFile(page, fixture);
  await expect(page.locator('.timeline__track')).toBeVisible();

  const trackId = await getFirstTrackId(page);

  // Presence, not content: the arrhythmic fixture legitimately produces a
  // result with nothing usable in it, and polling for ticks there would
  // hang forever (kb/verification.md, `waitForBackgroundAnalysis`).
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) => Boolean(window.__mawimbi?.spectrogramCache.getRhythm(id)),
          trackId,
        ),
      {
        timeout: ANALYSIS_TIMEOUT_MS,
        intervals: [ANALYSIS_POLL_INTERVAL_MS],
      },
    )
    .toBe(true);

  return trackId;
}

/**
 * Waits for the overlay to actually have rungs on it. The overlay never
 * touches its canvas until there is a grid to draw (an anchorless project
 * costs it nothing), so "the canvas has a size" is not a signal that works
 * for both outcomes — this polls the drawn rungs themselves.
 */
async function waitForRungs(
  page: import('@playwright/test').Page,
): Promise<void> {
  await expect
    .poll(async () => (await readRungRows(page)).length, {
      timeout: SEEK_SETTLE_TIMEOUT_MS,
    })
    .toBeGreaterThan(0);
}

/**
 * Scrubs the runway forward to `targetSeconds` with a real wheel gesture —
 * the one interaction that both scrolls the runway *and* commits a seek
 * while stopped, so the transport, the scroll position and the rendered
 * content all end up describing the same moment. Negative delta is
 * forward: the runway's scroll is inverted (later time = smaller
 * scrollTop).
 */
async function scrubToTime(
  page: import('@playwright/test').Page,
  targetSeconds: number,
): Promise<void> {
  await page.locator('.floating-toolbar').getByTitle('Rewind').click();
  const phantom = page.locator('.scrubber__phantom');
  await phantom.hover();
  await page.mouse.wheel(0, -targetSeconds * PPS);

  await expect
    .poll(
      () => page.evaluate(() => window.__mawimbi?.playback.getEngineTime()),
      { timeout: SEEK_SETTLE_TIMEOUT_MS },
    )
    .toBeGreaterThan(targetSeconds - 1);
}

/** The induced grid the anchor's persisted ticks must produce, in project time. */
async function expectedGridTimes(
  page: import('@playwright/test').Page,
  trackId: string,
): Promise<number[]> {
  const ticks = await page.evaluate(
    (id) => window.__mawimbi?.spectrogramCache.getRhythm(id)?.ticks ?? [],
    trackId,
  );
  return induceBeatGrid(ticks);
}

function closestDistance(values: number[], target: number): number {
  return Math.min(...values.map((value) => Math.abs(value - target)));
}

test.describe('Beat rungs', () => {
  test('render the induced grid on both sides of the playhead line', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const trackId = await uploadAndAnalyse(page, CLICK_120BPM_AUDIO);
    await scrubToTime(page, 6);
    await waitForRungs(page);

    const geometry = await readGeometry(page);
    const gridTimes = await expectedGridTimes(page, trackId);
    const rungScreenYs = (await readRungRows(page)).map(
      (y) => y + geometry.canvasTop,
    );

    expect(rungScreenYs.length).toBeGreaterThan(3);

    // Every drawn rung sits where its grid point projects to.
    const predicted = gridTimes
      .map((time) => screenYForTime(geometry, time))
      .filter((y) => y >= geometry.canvasTop)
      .filter((y) => y <= geometry.canvasTop + geometry.canvasHeight);
    expect(rungScreenYs).toHaveLength(predicted.length);
    for (const y of predicted) {
      expect(
        closestDistance(rungScreenYs, y),
        `no rung within ${RUNG_TOLERANCE_PX}px of predicted Y ${y} (drawn: ${JSON.stringify(rungScreenYs)})`,
      ).toBeLessThanOrEqual(RUNG_TOLERANCE_PX);
    }

    // …and where the music's actual beats are, independent of this
    // feature's own grid math: the fixture is exactly 120 BPM.
    const beatSeconds = 60 / CLICK_120BPM.bpm;
    for (const y of rungScreenYs) {
      const beatIndex = Math.round(
        (geometry.contentBoundaryY - y) / PPS / beatSeconds,
      );
      const groundTruthY = screenYForTime(geometry, beatIndex * beatSeconds);
      expect(
        Math.abs(y - groundTruthY),
        `rung at Y ${y} is not on a ground-truth beat (nearest is ${groundTruthY})`,
      ).toBeLessThanOrEqual(GROUND_TRUTH_TOLERANCE_PX);
    }

    // Uniform spacing for a steady pulse, against ground truth rather than
    // against the drawn rungs' own average — a grid that drifted at a
    // constant wrong tempo would still be self-consistently even.
    const sorted = [...rungScreenYs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBeCloseTo(beatSeconds * PPS, 0);
    }

    // The memory field is the design surface and the anticipation strip
    // renders the same grid (spec Decision 5) — both must be populated.
    expect(
      sorted.filter((y) => y > geometry.playheadLineY).length,
      'no rungs in the memory field (below the playhead line)',
    ).toBeGreaterThan(0);
    expect(
      sorted.filter((y) => y < geometry.playheadLineY).length,
      'no rungs in the anticipation strip (above the playhead line)',
    ).toBeGreaterThan(0);
  });

  test('paint on screen where the grid outlives the audio', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const trackId = await uploadAndAnalyse(page, CLICK_120BPM_AUDIO);
    // Past the fixture's last click (15.5 s), so the grid's final points
    // land over the tail — a region whose only bright rows can be rungs.
    await scrubToTime(page, 16);
    await waitForRungs(page);

    const geometry = await readGeometry(page);
    const gridTimes = await expectedGridTimes(page, trackId);
    const lastClickSeconds =
      (CLICK_120BPM.numBeats - 1) * (60 / CLICK_120BPM.bpm);

    const tailYs = gridTimes
      .filter((time) => time > lastClickSeconds)
      .map((time) => screenYForTime(geometry, time))
      .filter(
        (y) =>
          y >= geometry.canvasTop &&
          y <= geometry.canvasTop + geometry.canvasHeight,
      );
    expect(
      tailYs.length,
      'the fixture produced no grid points past its last click — the discriminating region this test needs',
    ).toBeGreaterThan(0);

    // Inset from the viewport edges so the runway rails' glow can't stand
    // in for a rung, and decode once so every row is read at one instant.
    const clip = { x: 200, y: 0, width: 880, height: 640 };
    const decoded = await decodeClip(page, clip);

    for (const y of tailYs) {
      const row = y - clip.y;
      // Local background, sampled either side of the rung: the playhead
      // meter's translucent panel covers part of this band, so a single
      // whole-clip background value would be wrong on one side of it.
      const background =
        (rowLuminance(decoded, row - 10) + rowLuminance(decoded, row + 10)) / 2;
      expect(
        hasHorizontalLineAtRow(decoded, row, background),
        `no painted line on screen at rung Y ${y} (local background ${background.toFixed(1)})`,
      ).toBe(true);
    }
  });

  test('spacing follows a tempo ramp', async ({ page }) => {
    test.setTimeout(90_000);
    await uploadAndAnalyse(page, ACCELERANDO_CLICK_AUDIO);
    await scrubToTime(page, 6);
    await waitForRungs(page);

    const geometry = await readGeometry(page);
    const rungYs = (await readRungRows(page))
      .map((y) => y + geometry.canvasTop)
      .sort((a, b) => a - b);
    expect(rungYs.length).toBeGreaterThan(3);

    // Screen Y decreases as time increases, so gaps *earlier* in the take
    // are the ones lower down: walking the sorted list top-to-bottom walks
    // backwards in time, and an accelerando's gaps must grow.
    const gaps = rungYs.slice(1).map((y, i) => y - rungYs[i]);
    for (let i = 1; i < gaps.length; i++) {
      expect(
        gaps[i],
        `rung spacing shrank going back in time (${JSON.stringify(gaps)})`,
      ).toBeGreaterThan(gaps[i - 1] - 1);
    }
    // And it genuinely ramps rather than sitting on one global tempo —
    // which is what a raw-BPM grid would draw.
    expect(gaps[gaps.length - 1] - gaps[0]).toBeGreaterThan(2);
  });

  test('render nothing without a confident anchor', async ({ page }) => {
    test.setTimeout(120_000);
    const noiseTrackId = await uploadAndAnalyse(page, ARRHYTHMIC_NOISE_AUDIO);
    await scrubToTime(page, 6);

    // Not "no line visible on screen": continuous noise paints the whole
    // runway, so a screenshot could not distinguish an absent rung from a
    // rung lost in the noise. The overlay's own canvas can.
    expect(await readRungRows(page)).toEqual([]);

    // The negative above is only meaningful with a precondition that says
    // *why* nothing was drawn (kb/verification.md: a "didn't happen"
    // assertion passes trivially when the code path never ran). Two of
    // them: analysis genuinely produced an estimate and it genuinely
    // failed the gate…
    const confidence = await page.evaluate(
      (id) => window.__mawimbi?.spectrogramCache.getRhythm(id)?.confidence,
      noiseTrackId,
    );
    expect(confidence).toBeLessThan(MIN_TEMPO_CONFIDENCE);

    // …and the overlay in *this* page is alive and would have drawn: give
    // it a confident anchor and the rungs appear, with nothing else about
    // the page changed.
    await uploadAudioFile(page, CLICK_120BPM_AUDIO);
    await expect(page.locator('.timeline__track')).toHaveCount(2);
    await expect
      .poll(async () => (await readRungRows(page)).length, {
        timeout: ANALYSIS_TIMEOUT_MS,
        intervals: [ANALYSIS_POLL_INTERVAL_MS],
      })
      .toBeGreaterThan(0);
  });

  test('the overlay sits above track content and below the runway rails', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await uploadAndAnalyse(page, CLICK_120BPM_AUDIO);

    const layers = await page.evaluate(() => {
      const timeline = document.querySelector('.timeline')!;
      return {
        rung: getComputedStyle(document.querySelector('.timeline__rhythm')!)
          .zIndex,
        rails: getComputedStyle(timeline, '::before').zIndex,
        railsAfter: getComputedStyle(timeline, '::after').zIndex,
      };
    });

    // Keep in sync with Timeline.css's tiers: the highest track level
    // (`--foreground`/`--edit-active`) is 2. Asserting the exact
    // neighbours, not just "greater than", so a tier creeping up to meet
    // the overlay's level fails here rather than silently reordering the
    // runway.
    expect(Number(layers.rung)).toBeGreaterThan(2);
    expect(Number(layers.rails)).toBeGreaterThan(Number(layers.rung));
    expect(layers.railsAfter).toBe(layers.rails);
  });
});

function rowLuminance(
  decoded: { data: number[]; width: number; height: number },
  y: number,
): number {
  const row = Math.min(Math.max(Math.round(y), 0), decoded.height - 1);
  let total = 0;
  for (let x = 0; x < decoded.width; x++) {
    const i = (row * decoded.width + x) * 4;
    total +=
      0.299 * decoded.data[i] +
      0.587 * decoded.data[i + 1] +
      0.114 * decoded.data[i + 2];
  }
  return total / decoded.width;
}
