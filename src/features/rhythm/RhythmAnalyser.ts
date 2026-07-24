// RhythmAnalyser — extracts beat-tracked ticks/tempo/confidence and onset
// times from a mono audio signal using essentia.js (spec 008 milestone 1).
//
// RhythmExtractor2013 gives the *categorical* layer (the beat a listener
// taps) — its `ticks` feed milestone 3's induced-grid regularization, not
// the raw rendering. OnsetRate gives the *nuance* layer (actual onset
// timing, including swing/push) — picked over SuperFluxExtractor after
// empirical shape validation on the click/swung/clicks-then-continue
// fixtures found SuperFlux systematically drops the first onset and
// hallucinates onsets past where clicking stops (kb/decisions.md,
// 2026-07-24). One-shot whole-signal calls only — essentia's per-frame call
// cost is a known trap (#236, kb/domain.md).
//
// Neither RhythmExtractor2013 nor OnsetRate exposes a sample-rate
// parameter in essentia.js's API — both assume 44100 Hz internally, so
// input at any other rate is resampled first (mirroring the classification
// pipeline's own resample-to-target-rate pattern).

import { getEssentia } from '../classification/essentiaLoader';
import { resample } from '../classification/resample';

export type RhythmData = {
  bpm: number;
  confidence: number;
  ticks: number[];
  onsets: number[];
};

// RhythmExtractor2013/OnsetRate assume this rate internally (essentia.js
// exposes no sampleRate parameter for either call).
const RHYTHM_ANALYSIS_SAMPLE_RATE = 44100;

const RHYTHM_EXTRACTOR_MAX_TEMPO_BPM = 208;
const RHYTHM_EXTRACTOR_MIN_TEMPO_BPM = 40;
const RHYTHM_EXTRACTOR_METHOD = 'multifeature';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deleteVector(vector: any): void {
  if (typeof vector?.delete === 'function') vector.delete();
}

/**
 * Extracts rhythm data from a mono signal at `sampleRate`. Resamples to
 * `RHYTHM_ANALYSIS_SAMPLE_RATE` first when `sampleRate` differs (a no-op for
 * the common case where it already matches).
 */
export async function analyseRhythm(
  mono: Float32Array,
  sampleRate: number,
): Promise<RhythmData> {
  const essentia = await getEssentia();
  const signal = resample(mono, sampleRate, RHYTHM_ANALYSIS_SAMPLE_RATE);
  const vector = essentia.arrayToVector(signal);

  try {
    const rhythm = essentia.RhythmExtractor2013(
      vector,
      RHYTHM_EXTRACTOR_MAX_TEMPO_BPM,
      RHYTHM_EXTRACTOR_METHOD,
      RHYTHM_EXTRACTOR_MIN_TEMPO_BPM,
    );
    const onsetResult = essentia.OnsetRate(vector);

    try {
      return {
        bpm: rhythm.bpm,
        confidence: rhythm.confidence,
        ticks: Array.from(essentia.vectorToArray(rhythm.ticks) as Float32Array),
        onsets: Array.from(
          essentia.vectorToArray(onsetResult.onsets) as Float32Array,
        ),
      };
    } finally {
      // essentia.js's VectorFloat return values are embind-wrapped
      // WASM-heap handles, not plain JS values (why `vectorToArray` exists
      // at all) — they leak WASM memory if never `.delete()`d, the same
      // class of bug CLAUDE.md documents for `ImageBitmap.close()`. This
      // worker's essentia instance is a session-long singleton
      // (`SpectrogramCache.getWorker()`), so every upload would otherwise
      // leak its full-duration signal and every returned vector for the
      // rest of the session.
      deleteVector(rhythm.ticks);
      deleteVector(rhythm.estimates);
      deleteVector(rhythm.bpmIntervals);
      deleteVector(onsetResult.onsets);
    }
  } finally {
    deleteVector(vector);
  }
}
