// SPIKE (mawimbi#593) — the propagation model: spec 009 Decision 1's
// event-driven wave packets with mirror-image reflections.
//
// `displacementAt` is a **pure function of (onsets, envelopes, T)** with no
// state carried between frames. That is the property the decision turns on:
// this sandbox never delivers a live worklet frame to the main thread
// (`kb/verification.md`, #542) and frame gaps run ~90 ms under load (#571),
// so a stateful per-frame simulation would be both unverifiable here and
// non-reproducible run to run. A closed-form packet sum is unit-testable at
// level 1 and renders identically regardless of how the machine is loaded.
//
// For the undamped linear string, images are not an approximation of a
// finite-difference sim — they are its solution: d'Alembert on [0, L] with
// fixed ends is exactly the free-space solution summed over odd, 2L-periodic
// image sources. Two honest caveats, both from the spec: with damping the
// 1D Green's function grows a trailing wake a translating packet does not
// reproduce, and the image sum is truncated.

import { type StringParams } from './stringParams';

/** MIDI range the pitch→visible-frequency mapping spans (the prototype's). */
export const PITCH_MIN_MIDI = 24;
export const PITCH_MAX_MIDI = 90;

/**
 * Visible shimmer rate in cycles per second at the bottom and top of the
 * pitch range — the prototype's `rate = 1.4 + 5·gn`. The audio frequency
 * itself is hundreds of Hz and invisible; this is it "scaled to a visible
 * range" as spec 009 Decision 1's correction puts it.
 */
const VISIBLE_FREQUENCY_MIN = 1.4;
const VISIBLE_FREQUENCY_MAX = 6.4;

/** Below this the packet contributes nothing worth the arithmetic. */
const PACKET_AMPLITUDE_FLOOR = 1e-3;

/** Gaussian support, in σ — beyond this an image cannot reach the domain. */
const SUPPORT_SIGMA = 3;

const TWO_PI = Math.PI * 2;

/**
 * Everything the propagation needs about one track, as stable closures
 * built once per track (not once per frame) so the render loop allocates
 * nothing here. All times are **project** seconds; the closures do the
 * `− track.startTime` conversion internally (`kb/domain.md`, #484).
 */
export type RibbonInput = {
  /** Onset times in project seconds, ascending. */
  onsets: number[];
  /** Loudness 0–1 at a project time. */
  loudnessAt: (time: number) => number;
  /** Harmonicity proxy 0 (tonal) – 1 (noisy) at a project time. */
  flatnessAt: (time: number) => number;
  /** MIDI pitch at a project time; `NaN` when unknown. */
  pitchAt: (time: number) => number;
};

export type Packet = {
  index: number;
  onsetTime: number;
  age: number;
  /** Position in string-lengths from the near anchor; may exceed 1. */
  centre: number;
  amplitude: number;
  /** Spatial frequency `k_r = f / c` — derived, never a free parameter. */
  waveNumber: number;
  flatness: number;
};

/**
 * Normalized 0–1 position of a MIDI pitch in the display range.
 *
 * `NaN`-safe by contract, not by accident: a silent frame legitimately has
 * no pitch (no note, no contour, and a centroid of zero), and every colour
 * and geometry channel downstream reads through here. An unguarded `NaN`
 * reaches `addColorStop` as `rgb(NaN, NaN, NaN)`, which *throws* — killing
 * the whole shared render loop's frame, not just this ribbon.
 */
export function normalizePitch(midi: number): number {
  if (!Number.isFinite(midi)) return 0;
  const span = PITCH_MAX_MIDI - PITCH_MIN_MIDI;
  return clamp01((midi - PITCH_MIN_MIDI) / span);
}

/**
 * The one pitch→motion mapping. `c` stays a free parameter (travel speed,
 * and therefore how much history the ribbon holds) and the ripple's spatial
 * frequency **emerges** as `k_r = f / c`, so `ω = c·k_r = f`.
 *
 * The first draft mapped `c` to pitch *and* `k_r` to pitch independently,
 * which over-determined ω — and the prototype showed the cost: its implied
 * wave speed *fell* from 1.4 to 0.64 as pitch rose, the opposite of the
 * intuition the mapping was resting on. It was also bad physics: on a
 * fixed-length string, tension sets frequency, not mode shape.
 */
export function visibleFrequency(midi: number): number {
  const span = VISIBLE_FREQUENCY_MAX - VISIBLE_FREQUENCY_MIN;
  return VISIBLE_FREQUENCY_MIN + span * normalizePitch(midi);
}

export function waveNumberFor(midi: number, c: number): number {
  return visibleFrequency(midi) / Math.max(1e-6, c);
}

/**
 * The anchor envelope, **asymmetric on purpose**.
 *
 * `sin(πu)^p` is exactly a pinned string's fundamental mode at `p = 1`, and
 * it is zero at both ends — which multiplies the freshest audio by zero, in
 * the view whose entire justification is making the just-heard legible. But
 * `u = 0` is *now* and `u = 1` is τ ago, so pinning them identically is a
 * category error on a time axis: pin the far end hard (old material really
 * should decay into the anchor) and floor the near end (spec 009 Decision
 * 1, [PROTO]).
 */
export function anchorEnvelope(u: number, params: StringParams): number {
  const mode = Math.sin(Math.PI * clamp01(u)) ** params.anchor;
  const nearFloor = params.nearFloor * (1 - clamp01(u));
  return Math.max(mode, nearFloor);
}

/**
 * Deterministic value noise for the percussive ripple waveform.
 *
 * **Never `Math.random`.** `kb/verification.md` records that pinning
 * `Math.random` for e2e determinism *silently silences `Tone.Reverb`* — no
 * error, no warning — so a `Math.random`-based ripple would be flattened to
 * a constant by that same established pin, and any later assertion that
 * percussive tracks ripple differently from tonal ones would pass or fail
 * for reasons unrelated to the code under test.
 */
export function rippleNoise(packetIndex: number, u: number): number {
  const seed = packetIndex * 12.9898 + u * 78.233;
  const value = Math.sin(seed) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

/**
 * Every packet still contributing at `T`, newest first.
 *
 * Exported because it is the falsifiable half of Decision 1: packet centres
 * must advance by exactly `c·Δt`, which is a statement about this function
 * rather than about anything on screen.
 */
export function collectPackets(
  input: RibbonInput,
  T: number,
  params: StringParams,
): Packet[] {
  const gamma = Math.max(1e-6, params.gamma);
  const maxAge = Math.log(1 / PACKET_AMPLITUDE_FLOOR) / gamma;
  const packets: Packet[] = [];

  for (let i = input.onsets.length - 1; i >= 0; i--) {
    const onsetTime = input.onsets[i];
    const age = T - onsetTime;
    if (age < 0) continue;
    if (age > maxAge) break; // ascending onsets — everything earlier is older

    const amplitude = input.loudnessAt(onsetTime) * Math.exp(-gamma * age);
    if (amplitude < PACKET_AMPLITUDE_FLOOR) continue;

    const midi = input.pitchAt(onsetTime);
    const pitch = Number.isNaN(midi) ? PITCH_MIN_MIDI : midi;
    packets.push({
      index: i,
      onsetTime,
      age,
      centre: params.c * age,
      amplitude,
      waveNumber: waveNumberFor(pitch, params.c),
      flatness: input.flatnessAt(onsetTime),
    });
  }
  return packets;
}

type Image = {
  position: number;
  /** Signed amplitude: sign from the reflection parity, magnitude from ρ. */
  weight: number;
};

/**
 * The mirror images of one packet that can actually reach `[0, 1]`.
 *
 * Enumeration: images sit at `2m + x` (an even number of reflections, so
 * the sign survives) and `2m − x` (odd, so it inverts). `ρ` attenuates per
 * bounce, and `ρ = 0` is a legal value — it *is* the no-reflection build,
 * which is what makes shipping the image machinery a config change to undo
 * rather than a rewrite (the Simplicity dissent in Decision 1).
 */
export function imagesFor(
  centre: number,
  params: StringParams,
  out: Image[],
): number {
  const rho = params.rho;
  const reach = SUPPORT_SIGMA * params.sigma;
  const low = -reach;
  const high = 1 + reach;
  const budget = Math.max(1, Math.round(params.imageCount));

  let count = 0;
  // Solve the m ranges directly instead of sweeping a wide window: only a
  // handful of images are ever in support, and `M_max` is a cost cap, not
  // an accuracy knob.
  const mStartEven = Math.ceil((low - centre) / 2);
  const mEndEven = Math.floor((high - centre) / 2);
  for (let m = mStartEven; m <= mEndEven && count < budget; m++) {
    const bounces = 2 * Math.abs(m);
    const weight = bounces === 0 ? 1 : rho ** bounces;
    if (weight < PACKET_AMPLITUDE_FLOOR) continue;
    out[count++] = { position: 2 * m + centre, weight };
  }

  const mStartOdd = Math.ceil((low + centre) / 2);
  const mEndOdd = Math.floor((high + centre) / 2);
  for (let m = mStartOdd; m <= mEndOdd && count < budget; m++) {
    const bounces = Math.abs(2 * m - 1);
    const weight = -(rho ** bounces);
    if (Math.abs(weight) < PACKET_AMPLITUDE_FLOOR) continue;
    out[count++] = { position: 2 * m - centre, weight };
  }

  return count;
}

/**
 * Writes the ribbon's vertical displacement at each `u` into `out`, in
 * units of lane height before `A_max` scaling.
 *
 * Deterministic for a given `(input, T, params)` — no `Math.random`, no
 * accumulated state, no dependence on the frame gap.
 */
export function displacementAt(
  us: Float32Array,
  T: number,
  input: RibbonInput,
  params: StringParams,
  out: Float32Array,
): void {
  out.fill(0);
  const packets = collectPackets(input, T, params);
  const sigma = Math.max(1e-4, params.sigma);
  const images: Image[] = [];

  for (const packet of packets) {
    const imageCount = imagesFor(packet.centre, params, images);
    for (let n = 0; n < imageCount; n++) {
      const { position, weight } = images[n];
      const scale = packet.amplitude * weight;
      for (let j = 0; j < us.length; j++) {
        const u = us[j];
        const offset = (u - position) / sigma;
        if (offset > SUPPORT_SIGMA || offset < -SUPPORT_SIGMA) continue;
        const gaussian = Math.exp(-offset * offset);
        const carrier = Math.cos(TWO_PI * packet.waveNumber * (u - position));
        const noise = rippleNoise(packet.index, u);
        // Harmonicity picks the ripple waveform: a sine for tonal material,
        // value noise for percussive. A real grouping cue (Bregman), not
        // decoration — and one a user can learn by watching a percussive
        // track next to a sustained one.
        const wave = carrier * (1 - packet.flatness) + noise * packet.flatness;
        const ripple = 1 - params.rippleDepth + params.rippleDepth * wave;
        out[j] += scale * gaussian * ripple;
      }
    }
  }

  addForcing(us, T, input, params, out);

  for (let j = 0; j < us.length; j++) {
    out[j] *= anchorEnvelope(us[j], params);
  }
}

/**
 * The continuous low-level forcing term.
 *
 * Answers the Architect's dissent in Decision 1: packets are onset-*
 * triggered, so a held organ chord has one onset and then nothing, and the
 * string would decay to rest while audio is plainly still playing. Without
 * this, String mode is a drum visualizer. The standing shape is the
 * fundamental mode, driven at the ribbon's own shimmer rate so it stays
 * visibly alive between onsets rather than being a static bulge.
 */
function addForcing(
  us: Float32Array,
  T: number,
  input: RibbonInput,
  params: StringParams,
  out: Float32Array,
): void {
  if (params.forcing <= 0) return;
  const loudness = input.loudnessAt(T);
  if (loudness <= 0) return;

  const midi = input.pitchAt(T);
  const pitch = Number.isNaN(midi) ? PITCH_MIN_MIDI : midi;
  const waveNumber = waveNumberFor(pitch, params.c);
  const frequency = visibleFrequency(pitch);
  const amplitude = params.forcing * loudness;

  for (let j = 0; j < us.length; j++) {
    const u = us[j];
    const phase = TWO_PI * (waveNumber * u - frequency * T);
    out[j] += amplitude * Math.sin(Math.PI * u) * Math.cos(phase);
  }
}

/** Evenly spaced sample positions along the ribbon, `u = 0` at the near end. */
export function makeSamplePositions(count: number): Float32Array {
  const us = new Float32Array(count);
  for (let j = 0; j < count; j++) us[j] = count > 1 ? j / (count - 1) : 0;
  return us;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
