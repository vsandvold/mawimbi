// SPIKE (mawimbi#593) — the five spectral envelopes plus the band vector,
// derived in one extra pass over CQT frames the analyser has already
// computed (spec 009 Decision 3).
//
// Frames are `Uint8Array` columns whose bytes map magnitude over a
// [−80, −30] dB window (`CQTAnalyser.magnitudeToByte`), so `byte / 255` is
// a normalized *log*-magnitude, not a linear one. Every statistic below is
// computed on that log-magnitude: the centroid is therefore a
// log-frequency, log-magnitude centroid, which spec 009 argues is a better
// brightness correlate than the conventional linear one and is free here.
//
// **Not persisted.** Hard constraint 1 on #593: no `DB_VERSION` bump — a
// spike gets reverted, and `openDB(name, 4)` against a database already
// upgraded to 5 throws `VersionError` permanently for any origin that saw
// the spike build. Envelopes live in memory for the session and are
// re-derived on reload.

/** Cross-section resolution — spec 009's `B`, [RWF]. */
export const BAND_COUNT = 8;

/**
 * Below this normalized log-magnitude a frame carries no usable spectral
 * shape, so centroid/flatness/f0 would be dividing noise by noise.
 */
const SILENCE_MAGNITUDE = 0.02;

/** Geometric-mean guard — `log(0)` is `-Infinity`, which poisons flatness. */
const FLATNESS_EPSILON = 1e-4;

/**
 * A peak must reach this fraction of the frame's maximum to count as the
 * fundamental. Deliberately generous: `f0Bin` is only the *fallback* pitch
 * source (the melody note-lock is primary, spec 009 Decision 6), so a
 * loose estimate that never freezes beats a strict one that often returns
 * nothing.
 */
const F0_PEAK_FRACTION = 0.55;

export type TrackEnvelopes = {
  /** Seconds per frame — the CQT's own hop. */
  timeResolution: number;
  frameCount: number;
  /** Raw RMS over the frame's normalized log-magnitudes. */
  rms: Float32Array;
  /**
   * Perceptual loudness: `rms` normalized to the track's own peak, then
   * curved. This — not `rms` — is what drives thickness and chroma.
   */
  level: Float32Array;
  /** Timbral brightness, in CQT bin units. */
  centroid: Float32Array;
  /** Half-wave-rectified spectral flux; attack character. */
  flux: Float32Array;
  /** Harmonicity proxy — low for tonal, high for noisy. */
  flatness: Float32Array;
  /** Lowest strong peak, in CQT bin units; `NaN` where none was found. */
  f0Bin: Float32Array;
  /** `BAND_COUNT` values per frame, max-pooled and normalized per frame. */
  bands: Uint8Array;
  binCount: number;
};

/**
 * Runs the envelope pass over already-computed CQT frames.
 *
 * Pools bins with **max, never sum** — summing overflowed `Uint8Array`
 * values mod 256 and corrupted the spectrogram once (#152, #195,
 * `kb/domain.md`), and max also preserves the strongest component per band.
 */
export function extractEnvelopes(
  frames: Uint8Array[],
  timeResolution: number,
): TrackEnvelopes {
  const frameCount = frames.length;
  const binCount = frameCount > 0 ? frames[0].length : 0;

  const rms = new Float32Array(frameCount);
  const centroid = new Float32Array(frameCount);
  const flux = new Float32Array(frameCount);
  const flatness = new Float32Array(frameCount);
  const f0Bin = new Float32Array(frameCount);
  const bands = new Uint8Array(frameCount * BAND_COUNT);

  for (let f = 0; f < frameCount; f++) {
    const frame = frames[f];
    const previous = f > 0 ? frames[f - 1] : null;

    let sumSquares = 0;
    let sumMagnitude = 0;
    let sumWeighted = 0;
    let sumLog = 0;
    let fluxSquares = 0;
    let peak = 0;

    for (let k = 0; k < binCount; k++) {
      const magnitude = frame[k] / 255;
      sumSquares += magnitude * magnitude;
      sumMagnitude += magnitude;
      sumWeighted += k * magnitude;
      sumLog += Math.log(magnitude + FLATNESS_EPSILON);
      if (magnitude > peak) peak = magnitude;
      if (previous) {
        const rise = magnitude - previous[k] / 255;
        if (rise > 0) fluxSquares += rise * rise;
      }
    }

    rms[f] = Math.sqrt(sumSquares / Math.max(1, binCount));
    flux[f] = Math.sqrt(fluxSquares);

    const isSilent = peak < SILENCE_MAGNITUDE || sumMagnitude <= 0;
    if (isSilent) {
      // Zero, not NaN: centroid and flatness feed colour, and a NaN there
      // propagates into a fill style that silently paints nothing. `f0Bin`
      // is the one field whose absence is meaningful, so it keeps NaN and
      // callers fall back to the centroid (spec 009 Decision 1).
      centroid[f] = 0;
      flatness[f] = 0;
      f0Bin[f] = Number.NaN;
    } else {
      centroid[f] = sumWeighted / sumMagnitude;
      const geometricMean = Math.exp(sumLog / binCount);
      const arithmeticMean = sumMagnitude / binCount + FLATNESS_EPSILON;
      flatness[f] = Math.min(1, geometricMean / arithmeticMean);
      f0Bin[f] = findLowestStrongPeak(frame, peak);
    }

    // Silence gets a zero band vector rather than a per-frame-normalized
    // noise floor. Without this guard `poolBands` normalizes *every* frame
    // to its own peak, so a silent frame's dither renders a full-contrast
    // cross-section — the same reason `centroid`/`flatness`/`f0Bin` are
    // guarded above (`/code-review` on PR #594). The ribbon still draws:
    // `ribbonRenderer` falls back to the plain core fill for an all-zero
    // vector, so the silence floor's "a ribbon never disappears" holds.
    if (!isSilent) poolBands(frame, bands, f * BAND_COUNT, binCount);
  }

  return {
    timeResolution,
    frameCount,
    rms,
    level: toPerceptualLevel(rms),
    centroid,
    flux,
    flatness,
    f0Bin,
    bands,
    binCount,
  };
}

/**
 * Raw RMS → the 0–1 loudness the visual channels actually want.
 *
 * Two corrections, both needed and both learned by looking at the thing
 * (mawimbi#593). **Per-track normalization**: an RMS over 225 CQT bins is
 * dominated by the bins that carry nothing, so even a loud take peaks
 * around 0.1–0.3 and the thickness and chroma mappings — which both assume
 * a 0–1 input — spend their whole range on the bottom fifth of it. The
 * ribbon renders as a near-invisible pale hairline. **The 0.6 power
 * curve**: `kb/domain.md` records the same curve on `Tone.Meter` RMS for
 * real-time loudness visuals, for perceptual linearity, and the argument
 * transfers unchanged.
 *
 * Normalizing per track is also what the app already does to the *audio*
 * on upload (`LoudnessNormalizer`, #119) — an amateur-friendliness rule,
 * not an audio-engineering nicety — so the visual matching it is the
 * consistent choice rather than a new one.
 */
const LOUDNESS_CURVE_EXPONENT = 0.6;

/** A track this quiet has no usable peak to normalize against. */
const MIN_NORMALIZATION_PEAK = 1e-4;

function toPerceptualLevel(rms: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] > peak) peak = rms[i];
  }
  const level = new Float32Array(rms.length);
  if (peak < MIN_NORMALIZATION_PEAK) return level;
  for (let i = 0; i < rms.length; i++) {
    level[i] = (rms[i] / peak) ** LOUDNESS_CURVE_EXPONENT;
  }
  return level;
}

/**
 * Lowest local maximum reaching `F0_PEAK_FRACTION` of the frame peak — a
 * cheap fundamental estimate that prefers the lowest strong partial over
 * the loudest one, since the loudest partial of a bright tone is often a
 * harmonic.
 */
function findLowestStrongPeak(frame: Uint8Array, peak: number): number {
  const threshold = peak * F0_PEAK_FRACTION;
  for (let k = 1; k < frame.length - 1; k++) {
    const magnitude = frame[k] / 255;
    if (magnitude < threshold) continue;
    if (frame[k] >= frame[k - 1] && frame[k] >= frame[k + 1]) return k;
  }
  return Number.NaN;
}

/**
 * Max-pools `frame` into `BAND_COUNT` log-spaced bands (CQT bins are
 * already log-spaced, so equal bin spans are equal frequency ratios) and
 * normalizes to the frame's own peak.
 *
 * Per-frame normalization is what makes the cross-section carry *shape*
 * rather than level: an absolute band vector fades with loudness and
 * reintroduces the invisibility failure it was added to solve — a quiet
 * high note being both thin and light (spec 009 Decision 3, [RWF]).
 */
function poolBands(
  frame: Uint8Array,
  out: Uint8Array,
  offset: number,
  binCount: number,
): void {
  let framePeak = 0;
  for (let band = 0; band < BAND_COUNT; band++) {
    const start = Math.floor((band * binCount) / BAND_COUNT);
    const end = Math.floor(((band + 1) * binCount) / BAND_COUNT);
    let maximum = 0;
    for (let k = start; k < end; k++) {
      if (frame[k] > maximum) maximum = frame[k];
    }
    out[offset + band] = maximum;
    if (maximum > framePeak) framePeak = maximum;
  }
  if (framePeak <= 0) return;
  for (let band = 0; band < BAND_COUNT; band++) {
    out[offset + band] = Math.round((out[offset + band] / framePeak) * 255);
  }
}

/**
 * Frame index for a track-buffer-relative time, or −1 outside the take.
 *
 * Deliberately not clamped to the last frame: a track that has finished
 * playing must read as silent, and clamping would hold its final loudness
 * on the ribbon for the rest of the project.
 */
export function frameIndexAt(
  envelopes: TrackEnvelopes,
  trackTime: number,
): number {
  const index = Math.floor(trackTime / envelopes.timeResolution);
  if (index < 0 || index >= envelopes.frameCount) return -1;
  return index;
}

/** Reads one envelope at a track-buffer-relative time; 0 outside the take. */
export function sampleEnvelope(
  series: Float32Array,
  envelopes: TrackEnvelopes,
  trackTime: number,
): number {
  const index = frameIndexAt(envelopes, trackTime);
  if (index < 0) return 0;
  return series[index];
}
