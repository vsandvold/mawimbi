/**
 * The arrival pulse (spec 008 milestone 5, #571) — does the loudness
 * meter's frame actually flare as each induced-grid beat crosses the
 * playhead line, and only then?
 *
 * **Where the pixels come from.** The glow is read out of the playhead
 * meter's own canvas (`getImageData`) rather than a composited screenshot,
 * for the reason the beat rungs' geometry assertions are read the same way
 * (kb/verification.md, #569): everything behind this canvas is the runway's
 * scrolling spectrogram, and the two moments this test must compare — just
 * after a beat and mid-interval — necessarily show different content
 * behind it, so a composited reading could not attribute a brightness
 * difference to the pulse. The meter canvas can: nothing in it paints
 * outside the meter rectangle except the pulse's own glow, which makes a
 * band just outside the rectangle's left edge an unambiguous signature.
 * The claim being verified is still a paint claim — this is the renderer's
 * real output through the real render loop, not a recomputation of it.
 *
 * **Why a sampled trace rather than two screenshots.** The issue's
 * acceptance criterion asks for one screenshot just past a beat and
 * another mid-interval. Two round trips at chosen instants is the shape
 * that #484 already found unreliable here: this sandbox's rAF loop advances
 * in uneven 20–90 ms steps, and the flare's whole life is ~230 ms. Sampling
 * *inside the page*, one reading per frame with the engine time read in the
 * same callback, keeps both readings on the page's own clock and proves
 * more than "it was lit once" — across twelve beats: the flares recur, they
 * sit early in the interval, they are never late in it, and none of them
 * happens at a moment no grid point had just crossed.
 *
 * **The one asymmetry to know about.** A reading's engine time is an *upper*
 * bound on the phase the canvas is showing, never a lower one: the canvas
 * holds the last painted frame, which can be a whole frame gap older. So
 * "dark late in the interval" can be asserted per sample (after subtracting
 * that gap), while "lit just after the beat" cannot — a reading taken
 * microseconds past a beat routinely shows the paint from just before it,
 * and demanding a glow there fails on honest behaviour. That direction is
 * asserted over the distribution instead (`LIT_MEDIAN_PHASE_MAX_S`); it
 * failed exactly this way on CI once before being written this way.
 */
import {
  ARRHYTHMIC_NOISE_AUDIO,
  CLICK_120BPM_AUDIO,
  expect,
  test,
  uploadAudioFile,
} from './fixtures';
import { getFirstTrackId } from './helpers/mawimbiBridge';
import {
  MIN_VISIBLE_PULSE,
  PULSE_DECAY_TIME_CONSTANT_SECONDS,
} from '../src/features/rhythm/BeatPulse';
import { induceBeatGrid } from '../src/features/rhythm/induceBeatGrid';
import { MIN_TEMPO_CONFIDENCE } from '../src/features/rhythm/tempo';
import { computeMeterRect } from '../src/features/workstation/scrubber/loudnessMeterRenderer';
import { activeRunwayConfig } from '../src/features/workstation/scrubber/runwayConfig';

const ANALYSIS_TIMEOUT_MS = 45_000;
const ANALYSIS_POLL_INTERVAL_MS = 250;
const TEST_TIMEOUT_MS = 120_000;

/**
 * Twelve beats of the 120 BPM fixture. Generous because the sampler is
 * slow, not because the effect is: this sandbox's rAF advances in ~90 ms
 * steps under load (measured here, consistent with kb/verification.md
 * #484), so a 2 s trace lands only a couple of readings inside each of the
 * two windows below — enough to pass, not enough to mean anything.
 */
const SAMPLE_DURATION_MS = 6_000;

/**
 * How far into a beat interval the frame must be back to its resting
 * state — `PULSE_DECAY_TIME_CONSTANT_SECONDS` puts the envelope below the
 * renderer's floor by ~230 ms, so this clears it with room to spare.
 *
 * Never applied to a sampled phase directly. The canvas holds the *last
 * painted* frame, whose engine time can be a whole frame gap behind the one
 * read alongside it, so a sample's phase is only an upper bound on the
 * phase actually on screen; the classification below subtracts each
 * sample's own gap first, which adapts to a real stall instead of assuming
 * a frame rate.
 */
const DARK_PHASE_MIN_S = 0.28;

/**
 * Where the flares must sit within the beat interval, as the *median* phase
 * of every sample that caught one.
 *
 * A median rather than a per-sample bound, and stated on the lit samples
 * rather than asserting that specific samples are lit, because of the same
 * skew: a reading taken microseconds after a beat routinely shows the paint
 * from just *before* it, which is a dark canvas at phase ≈ 0 and not a
 * defect. Measured locally, honest lit phases run 0.02–0.15 (median 0.08);
 * a grid half a beat out of phase — the falsification this bound exists to
 * catch — puts them at 0.25–0.40.
 */
const LIT_MEDIAN_PHASE_MAX_S = 0.2;

/**
 * How many separate flares the trace must catch across its twelve beats —
 * enough to establish that the pulse recurs on the grid rather than having
 * fired once. Deliberately far below the beat count; see the assertion for
 * why a match would be brittle and this is not.
 */
const MIN_TRACED_FLARES = 4;

/** The band just outside the meter's left edge — glow, and nothing else. */
const GLOW_BAND_INNER_INSET_PX = 3;
const GLOW_BAND_OUTER_INSET_PX = 9;

type GlowBand = { x: number; y: number; width: number; height: number };
type Sample = { time: number; alpha: number };

/**
 * The band of the meter canvas the glow spills into, in that canvas's own
 * pixels. Derived with the renderer's real `computeMeterRect` against the
 * canvas's real backing-store size, rather than a second approximation of
 * where the meter sits (`playhead-effects.spec.ts`'s pattern).
 *
 * Vertically the upper half only: sparkle particles burst around the
 * meter's *bottom* edge and spread ~16 px, which is the one other thing in
 * this canvas that can reach outside the rectangle.
 */
async function readGlowBand(
  page: import('@playwright/test').Page,
): Promise<GlowBand> {
  const size = await page
    .locator('.loudness-meter-playhead')
    .evaluate((el) => ({
      width: (el as HTMLCanvasElement).width,
      height: (el as HTMLCanvasElement).height,
    }));
  expect(
    size.width,
    'the meter canvas has no backing store yet — nothing could be read from it',
  ).toBeGreaterThan(0);

  const rect = computeMeterRect(
    size.width,
    size.height,
    activeRunwayConfig.playheadWidth,
  );
  return {
    x: rect.x - GLOW_BAND_OUTER_INSET_PX,
    y: rect.y + 1,
    width: GLOW_BAND_OUTER_INSET_PX - GLOW_BAND_INNER_INSET_PX,
    height: Math.floor(rect.height / 2),
  };
}

/**
 * Records the strongest alpha in `band` once per animation frame, paired
 * with the engine time read in the same callback, for `durationMs`.
 */
async function sampleGlow(
  page: import('@playwright/test').Page,
  band: GlowBand,
  durationMs: number,
): Promise<Sample[]> {
  return page.evaluate(
    ({ band, durationMs }) => {
      const canvas = document.querySelector(
        '.loudness-meter-playhead',
      ) as HTMLCanvasElement | null;
      if (!canvas) return [];
      const ctx = canvas.getContext('2d')!;
      const samples: { time: number; alpha: number }[] = [];
      const deadline = performance.now() + durationMs;

      return new Promise<{ time: number; alpha: number }[]>((resolve) => {
        const step = () => {
          const time = window.__mawimbi?.playback.getEngineTime() ?? -1;
          const { data } = ctx.getImageData(
            band.x,
            band.y,
            band.width,
            band.height,
          );
          let alpha = 0;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] > alpha) alpha = data[i];
          }
          samples.push({ time, alpha });
          if (performance.now() >= deadline) resolve(samples);
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },
    { band, durationMs },
  );
}

async function uploadAndAnalyse(
  page: import('@playwright/test').Page,
  fixture: string,
): Promise<string> {
  await page.goto('/project/test-id');
  await uploadAudioFile(page, fixture);
  await expect(page.locator('.timeline__track')).toBeVisible();

  const trackId = await getFirstTrackId(page);
  // Presence, not content: the arrhythmic fixture legitimately produces a
  // result with nothing usable in it, so polling for ticks would hang
  // (kb/verification.md, `waitForBackgroundAnalysis`).
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) => Boolean(window.__mawimbi?.spectrogramCache.getRhythm(id)),
          trackId,
        ),
      { timeout: ANALYSIS_TIMEOUT_MS, intervals: [ANALYSIS_POLL_INTERVAL_MS] },
    )
    .toBe(true);

  return trackId;
}

/** The induced grid the anchor's persisted ticks produce, in project time. */
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

/**
 * Seconds since the most recent grid point at or before `time`, or `null`
 * when that crossing happened before the trace started — the pulse only
 * attacks on a crossing it actually observed, so an earlier one says
 * nothing about what should be on screen.
 */
function phaseSinceBeat(
  gridTimes: number[],
  time: number,
  tracedFrom: number,
): number | null {
  let latest: number | null = null;
  for (const beat of gridTimes) {
    if (beat <= time && (latest === null || beat > latest)) latest = beat;
  }
  if (latest === null || latest <= tracedFrom) return null;
  return time - latest;
}

async function play(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('.floating-toolbar').getByTitle('Rewind').click();
  await page.getByTitle('Play', { exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__mawimbi?.playback.getEngineTime()))
    .toBeGreaterThan(0);
}

test.describe('Arrival pulse', () => {
  test('flares on the beat and rests between them', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    const trackId = await uploadAndAnalyse(page, CLICK_120BPM_AUDIO);
    const gridTimes = await expectedGridTimes(page, trackId);
    expect(
      gridTimes.length,
      'the fixture produced no induced grid — there would be nothing to pulse on',
    ).toBeGreaterThan(4);

    // Resolved before playback, so the trace's only work per frame is the
    // read itself (the #484 ritual).
    const band = await readGlowBand(page);

    await play(page);
    const samples = await sampleGlow(page, band, SAMPLE_DURATION_MS);

    expect(samples.length).toBeGreaterThan(10);
    const tracedFrom = samples[0].time;

    const litPhases: number[] = [];
    // For each lit sample, the *oldest* phase the canvas could have been
    // showing: the paint it holds is from somewhere in this frame's own
    // gap. A flare is only demonstrably late if even that lower bound is.
    const provenLatePhases: { time: number; phase: number }[] = [];
    for (const [index, sample] of samples.entries()) {
      const phase = phaseSinceBeat(gridTimes, sample.time, tracedFrom);
      if (phase === null || sample.alpha === 0) continue;
      litPhases.push(phase);

      const gap = index === 0 ? 0 : sample.time - samples[index - 1].time;
      if (phase - gap >= DARK_PHASE_MIN_S) {
        provenLatePhases.push({ time: sample.time, phase });
      }
    }

    // Positive precondition: the flare has to have been caught at all, or
    // everything below holds trivially (kb/verification.md — pair every
    // "didn't happen" with a "did happen").
    expect(
      litPhases.length,
      'the trace never caught the meter frame glowing at all',
    ).toBeGreaterThan(3);

    // Stated over the lit samples rather than over a bucket of "late"
    // ones. Bucketing the other way needed `phase - gap >= 0.28` *and*
    // `phase < 0.5` to both hold, a window that closes completely once the
    // frame gap passes ~0.22 s — so under load the *precondition* became
    // unsatisfiable and the test failed for its own sampling rate rather
    // than for the feature (`/code-review` on PR #588, reproduced at the
    // default worker count). This form has no such window: a slow trace
    // makes each bound looser, never contradictory.
    expect(
      provenLatePhases,
      'the meter frame was still glowing late in a beat interval',
    ).toEqual([]);

    // Where in the interval the flares sat. This is the half that would
    // catch a grid at the wrong phase; the "late" assertion above catches
    // the same defect from the other side.
    const sortedPhases = [...litPhases].sort((a, b) => a - b);
    const medianLitPhase = sortedPhases[Math.floor(sortedPhases.length / 2)];
    expect(
      medianLitPhase,
      `flares sat ${medianLitPhase.toFixed(3)}s into their beat interval (${JSON.stringify(sortedPhases.map((p) => +p.toFixed(3)))})`,
    ).toBeLessThanOrEqual(LIT_MEDIAN_PHASE_MAX_S);

    // …and every flare begins on a beat: a coincidence check between the
    // trace's rising edges and the sampler intervals that actually spanned
    // a grid point, rather than a count of either.
    //
    // Counts don't work here, in both directions. Beats over-predict,
    // because `BeatPulse` attacks once per *frame* however many grid points
    // that frame spans — its own documented behaviour, and what keeps a
    // stalled frame from producing two flares. Straddling frames still
    // over-predict, because a flare that is still lit when the next beat
    // arrives shows no rising edge at all: the two merge. Both effects
    // scale with the frame gap, so any fixed tolerance fails at some load
    // (measured: 8-against-12 and then 9-against-11, both for the frame
    // rate rather than the feature — `/code-review` on PR #588).
    //
    // What is load-independent is *where* the edges are, plus how many
    // distinct ones there were. One sampler interval of slack, because the
    // sampler's frames and the app's are different callbacks: whichever
    // runs second sees the other's beat one reading later.
    const straddlesBeat = samples.map(
      (sample, i) =>
        i > 0 &&
        gridTimes.some(
          (beat) =>
            beat > Math.max(samples[i - 1].time, tracedFrom) &&
            beat <= sample.time,
        ),
    );
    const isRisingEdge = samples.map(
      (sample, i) => i > 0 && sample.alpha > 0 && samples[i - 1].alpha === 0,
    );

    // No flare without a beat behind it — an envelope attacking on anything
    // other than a grid point shows up here, and so does a grid rendered at
    // the wrong phase.
    const unexplainedFlares = samples
      .map((sample, i) => ({ time: sample.time, i }))
      .filter(
        ({ i }) =>
          isRisingEdge[i] && !straddlesBeat[i] && !straddlesBeat[i - 1],
      )
      .map(({ time }) => +time.toFixed(3));
    expect(
      unexplainedFlares,
      'the meter frame flared at a moment no grid point had just crossed',
    ).toEqual([]);

    // …and the flare recurs, rather than the trace having caught one long
    // glow. A floor, not a match against the beats crossed: the converse
    // ("every beat lit the frame") is the direction the paint-versus-clock
    // asymmetry in this file's header rules out per sample — a sparse trace
    // can read a beat's flare late enough in its decay that the glow has
    // already left the sampled band, which is honest behaviour and not a
    // miss. Written as a match, it failed under three concurrent copies of
    // this spec while every flare it *did* catch was on a beat.
    //
    // Twelve beats pass under the trace and the loosest run measured here
    // still resolved nine of them, so this has wide margin while still
    // failing hard on a pulse that fires once or never.
    const risingEdges = isRisingEdge.filter(Boolean).length;
    expect(
      risingEdges,
      `only ${risingEdges} distinct flares across ${SAMPLE_DURATION_MS / 1000}s of playback`,
    ).toBeGreaterThanOrEqual(MIN_TRACED_FLARES);
  });

  test('never flares without a confident anchor', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    const trackId = await uploadAndAnalyse(page, ARRHYTHMIC_NOISE_AUDIO);
    const band = await readGlowBand(page);

    await play(page);
    const samples = await sampleGlow(page, band, SAMPLE_DURATION_MS);

    expect(samples.length).toBeGreaterThan(10);
    expect(
      samples.filter((sample) => sample.alpha > 0),
      'the meter frame flared on a fixture with no confident tempo',
    ).toEqual([]);

    // Why nothing was drawn: analysis genuinely ran and genuinely failed
    // the gate, rather than the pulse path never having been reached.
    const confidence = await page.evaluate(
      (id) => window.__mawimbi?.spectrogramCache.getRhythm(id)?.confidence,
      trackId,
    );
    expect(confidence).toBeLessThan(MIN_TEMPO_CONFIDENCE);
  });
});

test.describe('Pulse envelope constants', () => {
  test('the flare is over before the next beat at the zoom-independent floor', () => {
    // A guard on the two constants the e2e windows above are derived from:
    // if the decay is ever slowed past this, `DARK_PHASE_MIN_S` stops being
    // a dark window and the test above starts failing for a reason that has
    // nothing to do with the code under test.
    const levelAtDarkWindow = Math.exp(
      -DARK_PHASE_MIN_S / PULSE_DECAY_TIME_CONSTANT_SECONDS,
    );
    expect(levelAtDarkWindow).toBeLessThan(MIN_VISIBLE_PULSE);
  });
});
