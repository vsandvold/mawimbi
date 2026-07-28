import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  anchorEnvelope,
  collectPackets,
  displacementAt,
  makeSamplePositions,
  rippleNoise,
  visibleFrequency,
  waveNumberFor,
  type RibbonInput,
} from '../ribbonPropagation';
import { DEFAULT_STRING_PARAMS, type StringParams } from '../stringParams';

function makeParams(overrides: Partial<StringParams> = {}): StringParams {
  return { ...DEFAULT_STRING_PARAMS, ...overrides };
}

function makeInput(overrides: Partial<RibbonInput> = {}): RibbonInput {
  return {
    onsets: [0],
    loudnessAt: () => 1,
    flatnessAt: () => 0,
    pitchAt: () => 60,
    ...overrides,
  };
}

/** Index of the largest-magnitude sample, and its signed value. */
function peak(values: Float32Array): { index: number; value: number } {
  let index = 0;
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i]) > Math.abs(values[index])) index = i;
  }
  return { index, value: values[index] };
}

describe('displacementAt', () => {
  it('is deterministic — the same T twice returns identical arrays', () => {
    const params = makeParams();
    const input = makeInput({ onsets: [0, 0.3, 0.55] });
    const us = makeSamplePositions(96);
    const first = new Float32Array(96);
    const second = new Float32Array(96);

    displacementAt(us, 0.62, input, params, first);
    displacementAt(us, 0.62, input, params, second);

    expect(Array.from(second)).toEqual(Array.from(first));
  });

  // The property Decision 1 turns on: a closed-form packet sum has no
  // per-frame state, so a variable frame gap cannot change the picture.
  it('does not depend on how it was reached', () => {
    const params = makeParams();
    const input = makeInput({ onsets: [0, 0.2] });
    const us = makeSamplePositions(64);
    const direct = new Float32Array(64);
    const stepped = new Float32Array(64);

    displacementAt(us, 0.5, input, params, direct);
    for (const t of [0.1, 0.2, 0.3, 0.4]) {
      displacementAt(us, t, input, params, stepped);
    }
    displacementAt(us, 0.5, input, params, stepped);

    expect(Array.from(stepped)).toEqual(Array.from(direct));
  });

  it('advances packet centres by exactly c·Δt', () => {
    const params = makeParams({ c: 2.8, gamma: 0.2 });
    const input = makeInput({ onsets: [0] });

    const before = collectPackets(input, 0.1, params)[0];
    const after = collectPackets(input, 0.35, params)[0];

    expect(after.centre - before.centre).toBeCloseTo(params.c * 0.25, 10);
  });

  // The method-of-images claim, made falsifiable: a packet that has just
  // crossed the far anchor comes back inverted and attenuated by ρ.
  it('reflects a packet crossing u = 1 with inverted sign and ×ρ amplitude', () => {
    const rho = 0.55;
    // γ = 0 isolates the reflection from the decay, so the amplitude ratio
    // is ρ alone rather than ρ × exp(−γΔt).
    // `forcing: 0` isolates the packet layer — the continuous sustain term
    // would otherwise put its own standing peak at mid-ribbon.
    const params = makeParams({
      c: 1,
      rho,
      gamma: 0,
      rippleDepth: 0,
      sigma: 0.04,
      forcing: 0,
    });
    const input = makeInput({ onsets: [0] });
    const us = makeSamplePositions(401);

    const approaching = new Float32Array(401);
    const returning = new Float32Array(401);
    // Centres at u = 0.9 and (mirrored) u = 0.9 again, from x = 1.1.
    displacementAt(us, 0.9, input, params, approaching);
    displacementAt(us, 1.1, input, params, returning);

    const before = peak(approaching);
    const after = peak(returning);

    expect(before.value).toBeGreaterThan(0);
    expect(after.value).toBeLessThan(0);
    // Same position on the string, opposite sign, ρ of the amplitude.
    expect(us[after.index]).toBeCloseTo(us[before.index], 2);
    expect(Math.abs(after.value / before.value)).toBeCloseTo(rho, 2);
  });

  // `ρ = 0` *is* the no-reflection build (the Simplicity dissent in
  // Decision 1) — shipping the image machinery costs one loop and one sign
  // flip, and turning it off is a config change rather than a rewrite. What
  // disappears is the inverted returning lobe; the departing packet's own
  // tail still leaks past the anchor, which is correct.
  it('ρ = 0 leaves no inverted returning lobe', () => {
    const base = { c: 1, gamma: 0, rippleDepth: 0, forcing: 0, sigma: 0.04 };
    const input = makeInput({ onsets: [0] });
    const us = makeSamplePositions(201);
    const withImages = new Float32Array(201);
    const withoutImages = new Float32Array(201);

    displacementAt(
      us,
      1.1,
      input,
      makeParams({ ...base, rho: 0.55 }),
      withImages,
    );
    displacementAt(
      us,
      1.1,
      input,
      makeParams({ ...base, rho: 0 }),
      withoutImages,
    );

    expect(Math.min(...withImages)).toBeLessThan(-0.1);
    expect(Math.min(...withoutImages)).toBeGreaterThanOrEqual(0);
  });

  // The Adversary's dissent in Decision 1, made falsifiable: image
  // truncation must not change the anchor region.
  it('agrees between M_max = 16 and M_max = 64 near the anchors', () => {
    const input = makeInput({ onsets: [0, 0.4, 0.8] });
    const us = makeSamplePositions(129);
    const few = new Float32Array(129);
    const many = new Float32Array(129);

    displacementAt(us, 1.4, input, makeParams({ imageCount: 16 }), few);
    displacementAt(us, 1.4, input, makeParams({ imageCount: 64 }), many);

    for (let j = 0; j < 16; j++) {
      expect(few[j]).toBeCloseTo(many[j], 6);
      expect(few[128 - j]).toBeCloseTo(many[128 - j], 6);
    }
  });

  // Decision 1's [PROTO] correction: a symmetric `sin(πu)^p` envelope is
  // exactly zero at u = 0, which makes the freshest audio invisible at the
  // instant it arrives — in the view whose whole justification is making
  // the just-heard legible. Falsified by restoring the symmetric envelope.
  it('keeps the newest event visible at the near anchor', () => {
    const params = makeParams({ nearFloor: 0.25 });
    expect(anchorEnvelope(0, params)).toBeCloseTo(0.25, 10);
    // The far anchor is still pinned hard — old material decays into it.
    expect(anchorEnvelope(1, params)).toBeCloseTo(0, 10);

    const input = makeInput({ onsets: [0] });
    const us = makeSamplePositions(64);
    const out = new Float32Array(64);
    displacementAt(us, 0.001, input, makeParams({ rippleDepth: 0 }), out);
    expect(Math.abs(out[0])).toBeGreaterThan(0);
  });

  it('is symmetric-envelope free — sin(πu)^p alone would zero the near end', () => {
    const symmetric = makeParams({ nearFloor: 0 });
    expect(anchorEnvelope(0, symmetric)).toBe(0);
  });

  // The over-determination Decision 1 corrects: ω = c·k, so mapping both
  // `c` and `k_r` to pitch sets ω twice over. `c` is one free parameter and
  // `k_r = f/c` emerges. Falsified by re-introducing a pitch → c mapping.
  it('keeps c invariant to pitch and derives k_r = f/c', () => {
    const c = 2.8;
    for (const midi of [30, 48, 60, 72, 88]) {
      const waveNumber = waveNumberFor(midi, c);
      expect(c * waveNumber).toBeCloseTo(visibleFrequency(midi), 10);
    }
    // Higher pitch ⇒ finer ripple, falling out of λ = c/f rather than
    // being imposed.
    expect(waveNumberFor(80, c)).toBeGreaterThan(waveNumberFor(40, c));
  });

  it('degrades to a non-flat ribbon when there is no f0', () => {
    const params = makeParams();
    const input = makeInput({ onsets: [0.1], pitchAt: () => Number.NaN });
    const us = makeSamplePositions(64);
    const out = new Float32Array(64);

    displacementAt(us, 0.2, input, params, out);

    expect(out.every(Number.isFinite)).toBe(true);
    expect(Math.max(...Array.from(out, Math.abs))).toBeGreaterThan(0);
  });

  // The Architect's dissent in Decision 1: without a continuous forcing
  // term, a held chord has one onset and then nothing, and String mode is
  // a drum visualizer.
  it('sustains a deformation between onsets from the loudness envelope', () => {
    const input = makeInput({ onsets: [0] });
    const us = makeSamplePositions(64);
    const withForcing = new Float32Array(64);
    const withoutForcing = new Float32Array(64);
    // Long after the single onset has decayed away.
    const T = 30;

    displacementAt(us, T, input, makeParams({ forcing: 0.35 }), withForcing);
    displacementAt(us, T, input, makeParams({ forcing: 0 }), withoutForcing);

    expect(Math.max(...Array.from(withoutForcing, Math.abs))).toBe(0);
    expect(Math.max(...Array.from(withForcing, Math.abs))).toBeGreaterThan(0);
  });
});

describe('rippleNoise', () => {
  afterEach(() => vi.restoreAllMocks());

  // `kb/verification.md`: pinning `Math.random` for e2e determinism
  // silently silences `Tone.Reverb` — no error, no warning. A
  // `Math.random`-based ripple would be flattened to a constant by that
  // same established pin, so any later assertion about percussive-vs-tonal
  // ripple would pass or fail for unrelated reasons.
  it('is a deterministic hash, identical with Math.random stubbed', () => {
    const sample = () =>
      Array.from({ length: 16 }, (_, i) => rippleNoise(3, i / 15));

    const unstubbed = sample();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const stubbed = sample();

    expect(stubbed).toEqual(unstubbed);
    // Falsification guard: a constant series would satisfy the equality
    // above for the wrong reason.
    expect(new Set(unstubbed).size).toBeGreaterThan(8);
  });

  it('varies with packet index as well as position', () => {
    expect(rippleNoise(1, 0.5)).not.toBeCloseTo(rippleNoise(2, 0.5), 3);
  });

  it('stays inside [-1, 1]', () => {
    for (let i = 0; i < 200; i++) {
      const value = rippleNoise(i, (i % 37) / 37);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
