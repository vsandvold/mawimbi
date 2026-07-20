// --- Fundamental emphasis: expansive magnitude→height transfer ---
//
// The CQT byte scale is linear in dB (`magnitudeToByte`, CQTAnalyser.ts),
// so bar height is linear in dB and a harmonic 10 dB below its fundamental
// still draws ~80% of the fundamental's height — the bars read as a wall
// of near-equal heights. An expansive power curve on the byte value undoes
// that: it emphasizes whatever bin is strongest, wherever it falls in the
// register, so a tone's fundamental (usually its strongest partial) towers
// over harmonics and noise (spec 003 Q3).

/** Exponent for the expansive magnitude→height transfer (spec 003 Q3: γ ≈ 2–3). */
const GAMMA = 2.5;

/** Fast attack, slow decay — tames the 8-bit quantization flicker that the
    gamma transfer amplifies (spec 003 Q3 dissent); standard VU-meter
    ballistics, applied per bar. */
const ATTACK_COEFF = 0.6;
const DECAY_COEFF = 0.15;

/** Bar index of C4 (MIDI 60), relative to bar 0 = C1 (MIDI 24 — the same
    bin-0 origin `poolSemitoneBars` uses) — the register center the
    secondary band curve peaks at. */
const BAND_CENTER_BAR = 36;

/** Semitone distance from C4 at which the band curve bottoms out. */
const BAND_CURVE_RADIUS_SEMITONES = 42;

/** Floor of the band curve's weight. Mild by design: the gamma transfer
    above is the primary, content-adaptive mechanism; this fixed curve is
    only a secondary de-emphasis of the spectral extremes (spec 003 Q3). */
const BAND_CURVE_MIN_WEIGHT = 0.85;

/**
 * Expansive magnitude→height transfer: `(byte/255)^γ` rescaled back to the
 * byte range. Monotone; for γ > 1, every byte below the top of the scale
 * maps to a smaller output than a linear (γ = 1) mapping would, and the
 * gap widens as bytes get further from 255 — so strong bins pull further
 * ahead of weak ones than the source's dB-linear scale does.
 */
export function applyGammaTransfer(byte: number): number {
  return Math.pow(byte / 255, GAMMA) * 255;
}

/**
 * Mild secondary weighting that de-emphasizes the spectral extremes,
 * peaking at C4. Content-blind (unlike the gamma transfer above), so it
 * stays subordinate rather than boosting midrange noise (spec 003 Q3).
 */
export function computeBandWeight(barIndex: number): number {
  const distance = Math.abs(barIndex - BAND_CENTER_BAR);
  const normalized = Math.min(distance / BAND_CURVE_RADIUS_SEMITONES, 1);
  return 1 - (1 - BAND_CURVE_MIN_WEIGHT) * normalized ** 2;
}

/**
 * Converts pooled semitone bars into target bar values — gamma transfer
 * then band weight — ready for `BarSmoother`.
 */
export function computeTargetBarValues(semitoneBars: Uint8Array): Float32Array {
  const targets = new Float32Array(semitoneBars.length);
  for (let i = 0; i < semitoneBars.length; i++) {
    targets[i] = applyGammaTransfer(semitoneBars[i]) * computeBandWeight(i);
  }
  return targets;
}

/**
 * Per-bar attack/decay smoothing (spectrum-analyzer ballistics): fast
 * attack so transients read immediately, slow decay so the quantization
 * flicker the gamma transfer amplifies doesn't read as noise. A change in
 * bar count (e.g. first frame) resets to the target with no ramp, since
 * there is no prior state to smooth from.
 */
export class BarSmoother {
  private values: Float32Array = new Float32Array(0);

  /**
   * Drops the smoothed state so the next `update()` snaps to its target
   * with no ramp. Call this on any playback discontinuity (pause, stop,
   * seek) — without it, resuming after a loud passage decays the stale
   * pre-pause bars over the DECAY_COEFF ballistics instead of reflecting
   * the new position immediately.
   */
  reset(): void {
    this.values = new Float32Array(0);
  }

  update(targets: ArrayLike<number>): Float32Array {
    if (this.values.length !== targets.length) {
      this.values = Float32Array.from(targets);
      return this.values;
    }

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const current = this.values[i];
      const coeff = target > current ? ATTACK_COEFF : DECAY_COEFF;
      this.values[i] = current + (target - current) * coeff;
    }

    return this.values;
  }
}
