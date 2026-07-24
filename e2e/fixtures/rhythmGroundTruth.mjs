/**
 * Ground-truth click/beat times for the rhythm-analysis fixtures (spec 008
 * milestone 1, #567). Every fixture's true click times are computed here as
 * plain exported constants/functions — the single source both
 * `generate-wav.mjs` (which writes the audio) and any test asserting against
 * it import, so fixture bytes and expected values can never drift apart
 * (CLAUDE.md/kb/verification.md: fixtures export machine-readable ground
 * truth, not just audio).
 *
 * Plain ESM (not TypeScript) so `generate-wav.mjs` can import it directly
 * with plain `node` — no build step — while e2e/unit tests import the same
 * file unchanged.
 */

/** Isochronous click times (seconds) for `numBeats` beats at a fixed `bpm`. */
export function computeIsochronousClickTimes(bpm, numBeats) {
  const beatSeconds = 60 / bpm;
  return Array.from({ length: numBeats }, (_, i) => i * beatSeconds);
}

// --- test-click-120bpm.wav (spec 007 #557 / PR #574) ---

export const CLICK_120BPM = {
  bpm: 120,
  numBeats: 32,
  clickSeconds: 0.03,
  tailSeconds: 1.5,
};

export const CLICK_120BPM_TIMES = computeIsochronousClickTimes(
  CLICK_120BPM.bpm,
  CLICK_120BPM.numBeats,
);

// --- Swung eighths ---
//
// Each quarter-note beat is split into two eighths: the first ("downbeat"
// eighth) starts on the beat; the second (the "and") is delayed to
// `swingRatio` of the way through the beat instead of landing exactly
// halfway (straight eighths = 0.5). ~62% is a deliberately non-triplet swing
// ratio (a straight 2:1 triplet swing would be ~66.7%), chosen so the offset
// is clearly readable against an induced isochronous grid without being the
// "obvious" textbook ratio.

export const SWUNG_CLICK = {
  bpm: 120,
  numBeats: 32,
  swingRatio: 0.62,
  clickSeconds: 0.03,
  tailSeconds: 1.5,
};

export function computeSwungClickTimes(bpm, numBeats, swingRatio) {
  const beatSeconds = 60 / bpm;
  const times = [];
  for (let beat = 0; beat < numBeats; beat++) {
    const beatStart = beat * beatSeconds;
    times.push(beatStart);
    times.push(beatStart + swingRatio * beatSeconds);
  }
  return times;
}

export const SWUNG_CLICK_TIMES = computeSwungClickTimes(
  SWUNG_CLICK.bpm,
  SWUNG_CLICK.numBeats,
  SWUNG_CLICK.swingRatio,
);

// --- Accelerando (rubato-class tempo ramp) ---
//
// Tempo changes per beat (not continuously): the n-th inter-click interval
// uses the instantaneous bpm linearly interpolated across beat index, so the
// fixture's own ground truth is exactly reproducible arithmetic rather than
// an integral needing numerical approximation.

export const ACCELERANDO_CLICK = {
  startBpm: 100,
  endBpm: 140,
  numBeats: 32,
  clickSeconds: 0.03,
  tailSeconds: 1.5,
};

export function computeAccelerandoClickTimes(startBpm, endBpm, numBeats) {
  const bpmAtBeat = (n) => startBpm + ((endBpm - startBpm) * n) / (numBeats - 1);
  const times = [0];
  for (let beat = 1; beat < numBeats; beat++) {
    const intervalSeconds = 60 / bpmAtBeat(beat - 1);
    times.push(times[beat - 1] + intervalSeconds);
  }
  return times;
}

export const ACCELERANDO_CLICK_TIMES = computeAccelerandoClickTimes(
  ACCELERANDO_CLICK.startBpm,
  ACCELERANDO_CLICK.endBpm,
  ACCELERANDO_CLICK.numBeats,
);

// --- Clicks-then-silence (beats stop, audio continues) ---
//
// Ground truth only covers the click segment — the continuation tone that
// follows has no beats by design (the fixture proves ticks stop when
// clicking stops, even though the signal itself doesn't go silent).

export const CLICKS_THEN_CONTINUE = {
  bpm: 120,
  numClickBeats: 16,
  clickSeconds: 0.03,
  continuationSeconds: 10,
  continuationFrequency: 440,
  continuationFadeSeconds: 0.02,
};

export const CLICKS_THEN_CONTINUE_TIMES = computeIsochronousClickTimes(
  CLICKS_THEN_CONTINUE.bpm,
  CLICKS_THEN_CONTINUE.numClickBeats,
);

// --- Arrhythmic noise ---
//
// Continuous, non-decaying white noise for the whole duration — no click
// envelope, no periodicity. Ground truth is deliberately an empty array: a
// confident tempo/ticks result here would be the falsification case (spec
// 008's "no confident tempo → no rungs" honesty claim).

export const ARRHYTHMIC_NOISE = {
  durationSeconds: 16,
};

export const ARRHYTHMIC_NOISE_TIMES = [];
