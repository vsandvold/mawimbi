// SPIKE (mawimbi#593) — the ribbon's resting geometry: a thin line at the
// middle of the screen that rises and falls with the signal's fundamental.
//
// This replaces the packet-driven wobble as the *primary* shape (owner
// direction, 2026-07-28: "remove the wobbliness altogether … the ribbon
// rises/falls to match the fundamental pitch"). The packet model of spec
// 009 Decision 1 is not deleted — `ribbonPropagation.ts` and its tests
// stand — it is scaled by the `wobble` parameter, which defaults to 0. Two
// reasons to keep it rather than cut it: it is the artifact the spike was
// commissioned to evaluate, and turning it back on for that evaluation is
// then one slider rather than a revert.
//
// **Everything here is precomputed once per track, not per frame.** The
// attack/release follower below is inherently sequential — each sample
// depends on the one before it — which is exactly the statefulness spec 009
// Decision 1 rejected for the *render* path, because a scrub or seek has no
// valid state to resume from and this sandbox's frame gaps run ~90 ms
// (#571). Running it offline over the whole envelope, once, keeps the
// per-frame read a pure array lookup: same value for the same `T` however
// the playhead got there.

import { normalizePitch } from './ribbonPropagation';
import { type StringParams } from './stringParams';
import { type TrackEnvelopes } from './envelopes';

export type RibbonLine = {
  hop: number;
  frameCount: number;
  /** Adaptively smoothed fundamental (MIDI). Holds through gaps. */
  midi: Float32Array;
  /** Smooth 0–1 gate: how much the signal is above the noise floor. */
  presence: Float32Array;
  /** Smoothed 0–1 loudness — stroke width. */
  level: Float32Array;
  /** Smoothed 0–1 spectral centroid — colour intensity. */
  brightness: Float32Array;
};

export const EMPTY_RIBBON_LINE: RibbonLine = {
  hop: 0.025,
  frameCount: 0,
  midi: new Float32Array(0),
  presence: new Float32Array(0),
  level: new Float32Array(0),
  brightness: new Float32Array(0),
};

/**
 * Spectral flux reading that counts as a maximally sharp attack. Flux is
 * `‖m_t − m_{t−1}‖₂` over normalized log-magnitudes, so this is a scale
 * factor rather than a physical threshold — tuned by looking.
 */
const FLUX_REFERENCE = 0.9;

/** Per-second drop in level that counts as a maximally sharp release. */
const RELEASE_RATE_REFERENCE = 6;

/** Colour should not flicker with the fundamental — a fixed, slower τ. */
const BRIGHTNESS_TAU_SECONDS = 0.12;

/** MIDI the line rests at when it has never seen a signal. */
const REST_MIDI = 57;

/**
 * Runs the adaptive follower over a track's envelopes.
 *
 * `pitchAtTime` is the resolved fundamental — note-lock, then contour, then
 * the CQT centroid fallback (`RibbonSources`) — sampled at the envelope's
 * own hop. `NaN` means "no fundamental here"; the line **holds** its last
 * value rather than snapping to the centre, so an unvoiced consonant or a
 * percussive hit inside a phrase doesn't tear the contour apart. Returning
 * to the middle is `presence`'s job, and it is smooth.
 */
export function buildRibbonLine(
  envelopes: TrackEnvelopes,
  pitchAtTime: (trackTime: number) => number,
  params: StringParams,
): RibbonLine {
  const { frameCount, timeResolution: hop } = envelopes;
  if (frameCount === 0) return EMPTY_RIBBON_LINE;

  const midi = new Float32Array(frameCount);
  const presence = new Float32Array(frameCount);
  const level = new Float32Array(frameCount);
  const brightness = new Float32Array(frameCount);

  const tauFast = Math.max(1e-3, params.transientFast);
  const tauSlow = Math.max(tauFast, params.transientSlow);
  const brightnessAlpha = alphaFor(hop, BRIGHTNESS_TAU_SECONDS);
  const binScale = Math.max(1, envelopes.binCount);

  let heldMidi = REST_MIDI;
  let previousSampled = Number.NaN;
  let smoothedMidi = REST_MIDI;
  let smoothedPresence = 0;
  let smoothedLevel = 0;
  let smoothedBrightness = 0;

  for (let i = 0; i < frameCount; i++) {
    const rawLevel = envelopes.level[i];
    const isPresent = rawLevel > params.noiseFloor;

    // A click has no fundamental, so the line must not move for one — and
    // **flatness alone does not tell you that**. Measured on
    // `test-click-120bpm.wav` through this very pass: the loud frames of a
    // click read flatness ~0.03 (median), i.e. *more* peaky than a steady
    // tone's 0.0065 is far from, and well inside any threshold that still
    // admits real tonal material. Most CQT bins sit near zero at any
    // instant, so a broadband transient still looks peaky by the
    // geometric/arithmetic-mean measure. Only the noisiest tail (p90 ~0.95)
    // separates, which is why `tonality` is kept but relaxed to reject
    // genuine noise rather than asked to identify pitch.
    //
    // What actually separates them is **stability**: a tone holds its
    // estimate frame to frame, a click's jumps. Accepting an estimate only
    // when it agrees with the previous one to within `pitchStability`
    // semitones costs one comparison and removes the once-per-beat dive
    // that flatness could not.
    const isTonal = envelopes.flatness[i] < params.tonality;
    const sampled = pitchAtTime(i * hop);
    const isStable =
      Number.isFinite(previousSampled) &&
      Math.abs(sampled - previousSampled) <= params.pitchStability;
    if (isPresent && isTonal && isStable && Number.isFinite(sampled)) {
      heldMidi = sampled;
    }
    previousSampled = sampled;

    // The transient's own speed sets the interpolation time: a sharp
    // attack gets a short one, a slow swell a long one. Flux is already
    // "attack character" (spec 009 Decision 3's envelope table), so the
    // rise side reads it directly rather than re-deriving an onset
    // detector; the fall side uses the level's own rate of decay, since
    // flux is half-wave rectified and says nothing about releases.
    const attack = clamp01(envelopes.flux[i] / FLUX_REFERENCE);
    const previousLevel = i > 0 ? envelopes.level[i - 1] : 0;
    const dropRate = Math.max(0, previousLevel - rawLevel) / hop;
    const release = clamp01(dropRate / RELEASE_RATE_REFERENCE);
    const transient = Math.max(attack, release);
    const alpha = alphaFor(hop, tauSlow + (tauFast - tauSlow) * transient);

    // Below the noise floor the *pitch* glides home, rather than the
    // deviation being scaled down by presence. Scaling by presence made
    // every amplitude envelope a vertical gesture too — which is the wobble
    // character this geometry exists to remove, arriving by another route.
    // Height is pitch and only pitch; amplitude belongs to width and
    // opacity.
    const pitchTarget = isPresent ? heldMidi : REST_MIDI;
    smoothedMidi += (pitchTarget - smoothedMidi) * alpha;
    smoothedPresence += ((isPresent ? 1 : 0) - smoothedPresence) * alpha;
    smoothedLevel += ((isPresent ? rawLevel : 0) - smoothedLevel) * alpha;
    smoothedBrightness +=
      (clamp01(envelopes.centroid[i] / binScale) - smoothedBrightness) *
      brightnessAlpha;

    midi[i] = smoothedMidi;
    presence[i] = smoothedPresence;
    level[i] = smoothedLevel;
    brightness[i] = smoothedBrightness;
  }

  return { hop, frameCount, midi, presence, level, brightness };
}

/** One-pole coefficient for a time constant, at a fixed step. */
function alphaFor(dt: number, tau: number): number {
  return 1 - Math.exp(-dt / Math.max(1e-6, tau));
}

export type RibbonLineSample = {
  /** Fundamental as a 0–1 position on the absolute pitch axis. */
  pitch01: number;
  /** Raw smoothed MIDI, for the per-track relative axis. */
  midi: number;
  presence: number;
  level: number;
  brightness: number;
};

const RESTING_SAMPLE: RibbonLineSample = {
  pitch01: normalizePitch(REST_MIDI),
  midi: REST_MIDI,
  presence: 0,
  level: 0,
  brightness: 0,
};

/**
 * Reads the line at a track-buffer-relative time. Outside the take the
 * ribbon rests: centred, thin, dark — never absent, because a ribbon is a
 * persistent object rather than a trace that comes and goes
 * (`kb/product.md`'s "one stream, focusable sources").
 */
export function sampleRibbonLine(
  line: RibbonLine,
  trackTime: number,
  out: RibbonLineSample,
): RibbonLineSample {
  const position = trackTime / line.hop;
  if (position < -1 || position >= line.frameCount) {
    out.pitch01 = RESTING_SAMPLE.pitch01;
    out.midi = RESTING_SAMPLE.midi;
    out.presence = 0;
    out.level = 0;
    out.brightness = 0;
    return out;
  }

  // **Linear**, not nearest-frame. The series is sampled at the CQT's 25 ms
  // hop, which at the runway's default zoom is only ~5 px — so a
  // nearest-frame read draws the contour as a visible 5-px staircase, and
  // the smoother the underlying follower gets the more obviously the
  // remaining jaggedness is the *sampling*. Interpolating costs one lerp
  // per point and removes the stair entirely.
  const lower = Math.max(0, Math.floor(position));
  const upper = Math.min(line.frameCount - 1, lower + 1);
  const t = clamp01(position - lower);

  out.midi = mix(line.midi[lower], line.midi[upper], t);
  out.pitch01 = normalizePitch(out.midi);
  out.presence = mix(line.presence[lower], line.presence[upper], t);
  out.level = mix(line.level[lower], line.level[upper], t);
  out.brightness = mix(line.brightness[lower], line.brightness[upper], t);
  return out;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function makeLineSample(): RibbonLineSample {
  return { ...RESTING_SAMPLE };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
