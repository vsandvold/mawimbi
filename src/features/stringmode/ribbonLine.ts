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
  let smoothedMidi = REST_MIDI;
  let smoothedPresence = 0;
  let smoothedLevel = 0;
  let smoothedBrightness = 0;

  for (let i = 0; i < frameCount; i++) {
    const rawLevel = envelopes.level[i];
    const isPresent = rawLevel > params.noiseFloor;

    // A click has no fundamental, so the line must not move for one. The
    // pitch estimate is only *accepted* when the frame is tonal enough —
    // `flatness` (geometric/arithmetic mean, ~0 for a peaky spectrum, ~1
    // for noise) is the harmonicity proxy the envelope pass already
    // computes for exactly this question. Without the gate the centroid
    // fallback supplies a fresh, wildly different "pitch" on every
    // percussive transient and the line spikes once per beat — noise, and
    // the specific noise this geometry exists to remove.
    const isTonal = envelopes.flatness[i] < params.tonality;
    const sampled = pitchAtTime(i * hop);
    if (isPresent && isTonal && Number.isFinite(sampled)) heldMidi = sampled;

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

    smoothedMidi += (heldMidi - smoothedMidi) * alpha;
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
  const index = Math.round(trackTime / line.hop);
  if (index < 0 || index >= line.frameCount) {
    out.pitch01 = RESTING_SAMPLE.pitch01;
    out.midi = RESTING_SAMPLE.midi;
    out.presence = 0;
    out.level = 0;
    out.brightness = 0;
    return out;
  }
  out.midi = line.midi[index];
  out.pitch01 = normalizePitch(out.midi);
  out.presence = line.presence[index];
  out.level = line.level[index];
  out.brightness = line.brightness[index];
  return out;
}

export function makeLineSample(): RibbonLineSample {
  return { ...RESTING_SAMPLE };
}

/**
 * The anchor window: 0 at both ends of the ribbon, 1 across the middle.
 *
 * A `smoothstep` shoulder rather than `sin(πu)^p`: the sine is a broad hump
 * that bends the whole contour into an arch, which is a shape the audio did
 * not make. A narrow shoulder pins the ends and leaves the middle flat, so
 * what the ribbon draws between the anchors is the pitch and nothing else.
 */
export function lineAnchor(u: number, edge: number): number {
  const width = Math.max(1e-4, edge);
  return shoulder(u / width) * shoulder((1 - u) / width);
}

function shoulder(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
