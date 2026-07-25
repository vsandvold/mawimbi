// tempo — the one definition of "this track has a tempo we trust" (spec 007
// Goal 4 / #559, spec 008 Decision 3).
//
// Lives beside `RhythmAnalyser` rather than in a `features/tempo/` directory
// of its own: #559 originally planned a separate estimator + worker there,
// but spec 008 milestone 2 shipped the extraction first
// (`RhythmExtractor2013` already returns `bpm`/`confidence` alongside the
// beat ticks), so there is no second analysis to own — only the shared
// judgement about the numbers it produces, which belongs with the analysis
// that produces them.
//
// Every consumer that gates on tempo reads the same threshold: the effects
// drawer's BPM badge today, tempo-synced Echo (#560) and rhythm-anchor
// selection (spec 008 Decision 3) next. One constant, so "confident tempo"
// can never mean two different things in one screen.

/**
 * A track's tempo estimate — the display copy of `RhythmData`'s scalars,
 * carried on the track record so it persists with the project and is
 * readable anywhere a `Track` is (the `rhythms` store row stays the
 * analysis round-trip; see `ProjectStorageService`'s `RhythmStoreData`).
 */
export type TrackTempo = {
  bpm: number;
  confidence: number;
};

/**
 * Minimum `RhythmExtractor2013` confidence for an estimate to be treated as
 * real. essentia scores roughly 0–5.32; measured on the committed fixtures
 * (`RhythmAnalyser.fixtures.test.ts` pins both sides of this value):
 *
 * - 3.77 / 3.47 / 3.64 — click, swung, accelerando: rhythmic throughout
 * - 1.26 — `test-click-then-continue.wav`: 16 accurately-clicked beats, then
 *   a non-percussive continuation. A real performance, and the reason this
 *   threshold is not read off the clean-fixture numbers (kb/decisions.md,
 *   2026-07-24)
 * - 0.90 — arrhythmic noise
 * - 0.00 — a pure 440 Hz tone, a decaying burst: no rhythm at all
 *
 * 1.1 is the midpoint of the only gap that matters, between arrhythmic noise
 * and the weakest genuinely rhythmic material available. It is a tuning
 * judgement on two fixtures, not a derived value — human QA on real music
 * owns the final number (spec 008 milestone 3).
 */
export const MIN_TEMPO_CONFIDENCE = 1.1;

/**
 * Whether `tempo` is trustworthy enough to act on. An absent estimate
 * (analysis still running, or it failed) is not confident.
 */
export function isConfidentTempo(tempo: TrackTempo | undefined): boolean {
  if (!tempo) return false;
  return (
    Number.isFinite(tempo.bpm) &&
    tempo.bpm > 0 &&
    tempo.confidence >= MIN_TEMPO_CONFIDENCE
  );
}

/**
 * The tempo a consumer should use, or `null` when there isn't one worth
 * using. Low confidence reads as "no tempo", never as a tempo to be
 * disabled or greyed out — a missing estimate degrades to the untempo'd
 * behaviour rather than to a mysterious dead control (spec 007 Goal 5).
 */
export function selectConfidentTempo(
  tempo: TrackTempo | undefined,
): TrackTempo | null {
  return isConfidentTempo(tempo) ? tempo! : null;
}

/** Display form of a BPM estimate — whole beats, the precision a musician reads. */
export function formatBpm(bpm: number): string {
  return `${Math.round(bpm)} BPM`;
}
