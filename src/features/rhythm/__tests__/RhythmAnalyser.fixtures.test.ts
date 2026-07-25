/**
 * Real-essentia rhythm analysis against the committed rhythm fixtures (spec
 * 008 milestone 2, #568). Unlike `RhythmAnalyser.test.ts` — which mocks
 * `essentiaLoader` to prove the output-shape mapping and the WASM-handle
 * cleanup — this file runs the *actual* WASM extractor over the *actual*
 * fixture bytes and asserts against `rhythmGroundTruth.mjs`, the same
 * constants `generate-wav.mjs` used to write them. It is the earliest
 * falsifiable level for the spec's Goal 1 accuracy claims
 * (kb/verification.md): no mock can tell us whether essentia's ticks land on
 * the beat.
 *
 * Split into its own file because `RhythmAnalyser.test.ts`'s
 * `vi.mock('../../classification/essentiaLoader')` is file-scoped — a real
 * and a mocked essentia can't coexist in one module registry.
 *
 * The `__dirname` stub below is load-bearing: essentia's emscripten preamble
 * (`essentia-wasm.es.js`) picks its environment branch by checking
 * `ENVIRONMENT_IS_NODE` *first*, which is true under Vitest even in the
 * jsdom environment, and that branch dereferences `__dirname` — undefined in
 * an ES module, so the import throws `ReferenceError: __dirname is not
 * defined` without it. The value is only used to resolve a sibling `.wasm`
 * file the ES build doesn't actually need (its binary is inlined as a data
 * URI), but it must exist as a global before the import runs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ACCELERANDO_CLICK_TIMES,
  CLICK_120BPM,
  CLICK_120BPM_TIMES,
} from '../../../../e2e/fixtures/rhythmGroundTruth.mjs';
import { analyseRhythm, type RhythmData } from '../RhythmAnalyser';
import { MIN_TEMPO_CONFIDENCE, isConfidentTempo } from '../tempo';

const FIXTURE_DIR = path.resolve(process.cwd(), 'e2e/fixtures');
const ESSENTIA_DIST_DIR = path.resolve(
  process.cwd(),
  'node_modules/essentia.js/dist',
);

// Real WASM analysis of a ~17 s fixture measures ~1.7–1.9 s per call in this
// environment, plus a one-off ~250 ms module load — well past Vitest's 5 s
// default.
const ANALYSIS_TIMEOUT_MS = 60_000;

const BPM_TOLERANCE = 2;
const TICK_TOLERANCE_SECONDS = 0.07;
const ONSET_TOLERANCE_SECONDS = 0.05;

// Rhythmic fixtures score 3.4–3.8 on essentia's ~0–5.32 confidence scale;
// pure noise scores ~0.9 (kb/decisions.md, 2026-07-24). This bound only has
// to separate those two populations — it is deliberately *not* the product's
// anchor-selection threshold (spec 008 Decision 3), which is a QA tuning
// judgment the same KB entry explicitly flags as unresolvable from these
// numbers alone.
const ARRHYTHMIC_CONFIDENCE_CEILING = 2;
const RHYTHMIC_CONFIDENCE_FLOOR = 2;

// Continuous noise has no real onsets; the shape validation found exactly one
// spurious detection near t=0 (an edge artifact). A handful is "plausible" —
// a click-track's worth would mean the extractor is hallucinating rhythm.
const ARRHYTHMIC_MAX_ONSETS = 3;

beforeAll(() => {
  (globalThis as { __dirname?: string }).__dirname = ESSENTIA_DIST_DIR;
});

/**
 * Decodes a 16-bit PCM WAV fixture to mono float samples — the unit-test
 * counterpart to the browser's `decodeAudioData`, which needs a real
 * AudioContext jsdom doesn't have. Only handles what `generate-wav.mjs`
 * writes (16-bit PCM), and throws rather than guessing on anything else.
 */
function decodeWavFixture(fileName: string): {
  mono: Float32Array;
  sampleRate: number;
} {
  const bytes = readFileSync(path.join(FIXTURE_DIR, fileName));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let offset = 12; // past 'RIFF' + size + 'WAVE'
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataLength = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (dataOffset < 0 || bitsPerSample !== 16) {
    throw new Error(
      `${fileName}: expected a 16-bit PCM WAV (got ${bitsPerSample} bits, data chunk at ${dataOffset})`,
    );
  }

  const frames = dataLength / 2 / channels;
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      sum += view.getInt16(dataOffset + (frame * channels + channel) * 2, true);
    }
    mono[frame] = sum / channels / 32768;
  }
  return { mono, sampleRate };
}

function analyseFixture(fileName: string): Promise<RhythmData> {
  const { mono, sampleRate } = decodeWavFixture(fileName);
  return analyseRhythm(mono, sampleRate);
}

function distanceToNearest(times: number[], target: number): number {
  return times.reduce(
    (closest, time) => Math.min(closest, Math.abs(time - target)),
    Number.POSITIVE_INFINITY,
  );
}

function medianInterval(times: number[]): number {
  const intervals = times
    .slice(1)
    .map((time, index) => time - times[index])
    .sort((a, b) => a - b);
  return intervals[Math.floor(intervals.length / 2)];
}

describe('analyseRhythm on real fixtures', () => {
  it(
    'tracks the beat and every click of the steady 120 BPM fixture',
    async () => {
      const rhythm = await analyseFixture('test-click-120bpm.wav');
      const lastClick = CLICK_120BPM_TIMES[CLICK_120BPM_TIMES.length - 1];

      expect(Math.abs(rhythm.bpm - CLICK_120BPM.bpm)).toBeLessThanOrEqual(
        BPM_TOLERANCE,
      );
      expect(rhythm.confidence).toBeGreaterThan(RHYTHMIC_CONFIDENCE_FLOOR);

      // Every real click but the first has a tick on it. essentia's tracker
      // needs one interval to lock phase, so the very first beat is never
      // tagged (kb/decisions.md, 2026-07-24).
      for (const clickTime of CLICK_120BPM_TIMES.slice(1)) {
        expect(
          distanceToNearest(rhythm.ticks, clickTime),
          `no tick within ${TICK_TOLERANCE_SECONDS}s of the click at ${clickTime}s`,
        ).toBeLessThanOrEqual(TICK_TOLERANCE_SECONDS);
      }

      // …and no *extra* ticks inside the clicking span: counts are exact
      // there. The tracker also extrapolates past the last click (a real
      // precedent for milestone 6's phantom rungs), so ticks beyond it are
      // excluded from the count rather than treated as spurious.
      const ticksWithinClicks = rhythm.ticks.filter(
        (tick) => tick <= lastClick + TICK_TOLERANCE_SECONDS,
      );
      expect(ticksWithinClicks).toHaveLength(CLICK_120BPM_TIMES.length - 1);
      for (const tick of ticksWithinClicks) {
        expect(
          distanceToNearest(CLICK_120BPM_TIMES, tick),
          `tick at ${tick}s matches no ground-truth click`,
        ).toBeLessThanOrEqual(TICK_TOLERANCE_SECONDS);
      }

      // Onsets are the nuance layer: exact count, every click matched.
      expect(rhythm.onsets).toHaveLength(CLICK_120BPM_TIMES.length);
      for (const clickTime of CLICK_120BPM_TIMES) {
        expect(
          distanceToNearest(rhythm.onsets, clickTime),
          `no onset within ${ONSET_TOLERANCE_SECONDS}s of the click at ${clickTime}s`,
        ).toBeLessThanOrEqual(ONSET_TOLERANCE_SECONDS);
      }
    },
    ANALYSIS_TIMEOUT_MS,
  );

  it(
    'follows the drifting beat of the accelerando fixture rather than a uniform grid',
    async () => {
      const rhythm = await analyseFixture('test-click-accelerando.wav');

      for (const clickTime of ACCELERANDO_CLICK_TIMES.slice(1)) {
        expect(
          distanceToNearest(rhythm.ticks, clickTime),
          `no tick within ${TICK_TOLERANCE_SECONDS}s of the drifting click at ${clickTime}s`,
        ).toBeLessThanOrEqual(TICK_TOLERANCE_SECONDS);
      }

      // A uniform grid at the fixture's mean tempo would still drift far
      // outside ±70 ms across a 100→140 BPM ramp, so the per-click check
      // above already falsifies one; this asserts the direction of the drift
      // explicitly, so a failure says "the grid didn't accelerate" rather
      // than "some click missed."
      const third = Math.floor(rhythm.ticks.length / 3);
      expect(medianInterval(rhythm.ticks.slice(0, third))).toBeGreaterThan(
        medianInterval(rhythm.ticks.slice(-third)),
      );

      expect(rhythm.onsets).toHaveLength(ACCELERANDO_CLICK_TIMES.length);
      for (const clickTime of ACCELERANDO_CLICK_TIMES) {
        expect(
          distanceToNearest(rhythm.onsets, clickTime),
          `no onset within ${ONSET_TOLERANCE_SECONDS}s of the click at ${clickTime}s`,
        ).toBeLessThanOrEqual(ONSET_TOLERANCE_SECONDS);
      }
    },
    ANALYSIS_TIMEOUT_MS,
  );

  it(
    'reports low confidence on arrhythmic noise without crashing',
    async () => {
      const rhythm = await analyseFixture('test-arrhythmic-noise.wav');

      expect(rhythm.confidence).toBeLessThan(ARRHYTHMIC_CONFIDENCE_CEILING);
      expect(Number.isFinite(rhythm.bpm)).toBe(true);
      // Ticks are still produced (essentia always tracks *something*) — the
      // honesty gate is the confidence score, not an empty array, which is
      // why the spec gates rendering on confidence rather than tick count.
      expect(rhythm.ticks.every((tick) => Number.isFinite(tick))).toBe(true);
      expect(rhythm.onsets.length).toBeLessThanOrEqual(ARRHYTHMIC_MAX_ONSETS);
    },
    ANALYSIS_TIMEOUT_MS,
  );
});

/**
 * `MIN_TEMPO_CONFIDENCE` (spec 007 #559) is a tuning judgement, so what
 * makes it falsifiable is the *pair* of real fixtures it has to separate —
 * not either one alone. `test-click-then-continue.wav` is the load-bearing
 * case: a genuinely well-played but partial-duration performance scores far
 * closer to noise (1.26) than to a fixture that clicks throughout (3.4–3.8),
 * so a threshold read off the clean numbers would silently exclude real
 * material (kb/decisions.md, 2026-07-24). Raising the constant past ~1.26 or
 * dropping it below ~0.90 fails here rather than in a QA session.
 */
describe('MIN_TEMPO_CONFIDENCE separates real rhythm from noise', () => {
  it(
    'accepts a real performance that stops partway through the file',
    async () => {
      const rhythm = await analyseFixture('test-click-then-continue.wav');

      expect(
        isConfidentTempo(rhythm),
        `partial-duration performance scored ${rhythm.confidence.toFixed(2)}, below the ${MIN_TEMPO_CONFIDENCE} threshold`,
      ).toBe(true);
    },
    ANALYSIS_TIMEOUT_MS,
  );

  it(
    'rejects arrhythmic noise',
    async () => {
      const rhythm = await analyseFixture('test-arrhythmic-noise.wav');

      expect(
        isConfidentTempo(rhythm),
        `arrhythmic noise scored ${rhythm.confidence.toFixed(2)}, at or above the ${MIN_TEMPO_CONFIDENCE} threshold`,
      ).toBe(false);
    },
    ANALYSIS_TIMEOUT_MS,
  );

  it(
    'rejects a pure tone, which has no rhythm to estimate at all',
    async () => {
      const rhythm = await analyseFixture('test-tone-long.wav');

      expect(isConfidentTempo(rhythm)).toBe(false);
    },
    ANALYSIS_TIMEOUT_MS,
  );
});
