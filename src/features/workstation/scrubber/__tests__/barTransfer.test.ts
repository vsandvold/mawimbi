import { describe, expect, it } from 'vitest';

import { magnitudeToByte } from '../../../spectrogram/CQTAnalyser';
import {
  applyGammaTransfer,
  BarSmoother,
  computeBandWeight,
  computeTargetBarValues,
} from '../barTransfer';

describe('applyGammaTransfer', () => {
  it('is monotone: larger bytes never produce smaller output', () => {
    let previous = applyGammaTransfer(0);
    for (let byte = 1; byte <= 255; byte++) {
      const value = applyGammaTransfer(byte);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('leaves the endpoints fixed', () => {
    expect(applyGammaTransfer(0)).toBe(0);
    expect(applyGammaTransfer(255)).toBeCloseTo(255, 5);
  });

  it('pulls a mid-scale byte down further than a linear mapping would', () => {
    // gamma > 1 is expansive: below the top of the scale, output < input.
    expect(applyGammaTransfer(128)).toBeLessThan(128);
  });
});

describe('computeBandWeight', () => {
  it('weights C4 higher than C1 or C8', () => {
    const c1Bar = 0; // bar 0 = C1 (MIDI 24), poolSemitoneBars's bin-0 origin
    const c4Bar = 36; // C4 = MIDI 60, 36 semitones above C1
    const c8Bar = 84; // C8 = MIDI 108, 84 semitones above C1

    const c4Weight = computeBandWeight(c4Bar);
    expect(c4Weight).toBeGreaterThan(computeBandWeight(c1Bar));
    expect(c4Weight).toBeGreaterThan(computeBandWeight(c8Bar));
  });

  it('is mild: never de-emphasizes by more than a small fraction', () => {
    for (let bar = 0; bar <= 120; bar++) {
      expect(computeBandWeight(bar)).toBeGreaterThanOrEqual(0.8);
      expect(computeBandWeight(bar)).toBeLessThanOrEqual(1);
    }
  });
});

describe('computeTargetBarValues', () => {
  it('makes the fundamental-to-harmonic ratio bigger than the raw byte scale does', () => {
    // Fundamental well inside the dB range (not clipped), a harmonic 10 dB
    // weaker — both centered on C4 so the band weight cancels out of the
    // ratio.
    const c4Bar = 36;
    const fundamentalDb = -35;
    const harmonicDb = fundamentalDb - 10;
    const fundamentalByte = magnitudeToByte(10 ** (fundamentalDb / 20));
    const harmonicByte = magnitudeToByte(10 ** (harmonicDb / 20));

    const rawRatio = fundamentalByte / harmonicByte;

    const fundamentalBars = new Uint8Array(128);
    fundamentalBars[c4Bar] = fundamentalByte;
    const fundamentalTarget = computeTargetBarValues(fundamentalBars)[c4Bar];

    const harmonicBars = new Uint8Array(128);
    harmonicBars[c4Bar] = harmonicByte;
    const harmonicTarget = computeTargetBarValues(harmonicBars)[c4Bar];

    const expansiveRatio = fundamentalTarget / harmonicTarget;

    expect(expansiveRatio).toBeGreaterThan(rawRatio);
  });
});

describe('BarSmoother', () => {
  it('converges toward the target on repeated updates', () => {
    const smoother = new BarSmoother();
    let values = smoother.update([0]);
    expect(values[0]).toBe(0);

    for (let i = 0; i < 50; i++) {
      values = smoother.update([255]);
    }

    expect(values[0]).toBeCloseTo(255, 0);
  });

  it('attacks faster than it decays', () => {
    const attackSmoother = new BarSmoother();
    attackSmoother.update([0]);
    const afterOneAttackStep = attackSmoother.update([255])[0];

    const decaySmoother = new BarSmoother();
    decaySmoother.update([255]);
    const afterOneDecayStep = decaySmoother.update([0])[0];

    // One ballistics step should close more of the gap on attack (rising)
    // than on decay (falling) from a mirror-image starting point.
    const attackProgress = afterOneAttackStep / 255;
    const decayProgress = (255 - afterOneDecayStep) / 255;
    expect(attackProgress).toBeGreaterThan(decayProgress);
  });

  it('resets to the target with no ramp when the bar count changes', () => {
    const smoother = new BarSmoother();
    smoother.update([0, 0]);

    const values = smoother.update([10, 20, 30]);

    expect(Array.from(values)).toEqual([10, 20, 30]);
  });

  it('drops smoothed state on reset, so the next update snaps to target', () => {
    const smoother = new BarSmoother();
    smoother.update([255]);

    smoother.reset();
    const values = smoother.update([0]);

    expect(values[0]).toBe(0);
  });
});
