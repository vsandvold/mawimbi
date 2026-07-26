import { describe, expect, it } from 'vitest';

import {
  BeatPulse,
  MIN_VISIBLE_PULSE,
  PULSE_DECAY_TIME_CONSTANT_SECONDS,
} from '../BeatPulse';

/** A steady 120 BPM grid, in project time — the click fixture's own pulse. */
const GRID = [0, 0.5, 1, 1.5, 2, 2.5, 3];

/**
 * Drives the envelope frame by frame and returns the *transitions* rather
 * than the samples: `attack` wherever the level jumps upward, `decay`
 * wherever it falls. Counting polls above a threshold instead would report
 * a different number for the same behaviour at a different frame rate —
 * the state-flap lesson (kb/verification.md), applied to an envelope.
 */
function traceTransitions(
  pulse: BeatPulse,
  grid: number[],
  times: number[],
): { time: number; kind: 'attack' | 'decay' }[] {
  const transitions: { time: number; kind: 'attack' | 'decay' }[] = [];
  let previous = pulse.level;
  for (const time of times) {
    const level = pulse.update(grid, time);
    if (level > previous) transitions.push({ time, kind: 'attack' });
    else if (level < previous) transitions.push({ time, kind: 'decay' });
    previous = level;
  }
  return transitions;
}

/** Frame times from `start` to `end` at a fixed rate, `start` excluded. */
function frames(start: number, end: number, stepSeconds: number): number[] {
  const times: number[] = [];
  for (
    let time = start + stepSeconds;
    time <= end + 1e-9;
    time += stepSeconds
  ) {
    times.push(Number(time.toFixed(6)));
  }
  return times;
}

describe('BeatPulse', () => {
  it('starts silent and stays silent until a grid point is crossed', () => {
    const pulse = new BeatPulse();

    // Playback starts mid-interval: the first frame only establishes where
    // the transport is, so a resume can never inherit a phantom attack.
    expect(pulse.update(GRID, 0.6)).toBe(0);
    expect(pulse.update(GRID, 0.7)).toBe(0);
    expect(pulse.update(GRID, 0.9)).toBe(0);
  });

  it('attacks exactly once per grid point crossed', () => {
    const pulse = new BeatPulse();
    pulse.update(GRID, 0.6);

    const transitions = traceTransitions(pulse, GRID, frames(0.6, 2.6, 1 / 60));

    const attacks = transitions.filter((t) => t.kind === 'attack');
    // Grid points at 1.0, 1.5, 2.0 and 2.5 fall inside the traced window.
    expect(attacks).toHaveLength(4);
    for (const [index, beat] of [1, 1.5, 2, 2.5].entries()) {
      // The attack lands on the first frame at or after its grid point,
      // i.e. within one frame of it.
      expect(attacks[index].time).toBeGreaterThanOrEqual(beat);
      expect(attacks[index].time).toBeLessThan(beat + 1 / 60);
    }
  });

  it('only decays between beats, never re-attacks in steady state', () => {
    const pulse = new BeatPulse();
    pulse.update(GRID, 1);
    pulse.update(GRID, 1.01);

    // 1.01 → 1.49: entirely inside one beat interval.
    const transitions = traceTransitions(
      pulse,
      GRID,
      frames(1.01, 1.49, 1 / 60),
    );

    expect(transitions.every((t) => t.kind === 'decay')).toBe(true);
  });

  it('attacks once, not twice, when several grid points fall in one frame', () => {
    // A stalled frame (this sandbox's rAF runs irregularly under load —
    // kb/verification.md) can straddle more than one beat. The envelope has
    // one level, so that has to read as one attack, aged from the *latest*
    // beat crossed rather than the first.
    const pulse = new BeatPulse();
    pulse.update(GRID, 0.9);

    const level = pulse.update(GRID, 2.05);

    expect(level).toBeCloseTo(
      Math.exp(-0.05 / PULSE_DECAY_TIME_CONSTANT_SECONDS),
      6,
    );
  });

  it('decays exponentially on the engine clock, not the frame count', () => {
    const pulse = new BeatPulse();
    pulse.update(GRID, 0.9);
    pulse.update(GRID, 1);

    // One frame of 90 ms and nine frames of 10 ms must land on the same
    // level: the envelope is a function of engine time, so a dropped frame
    // can never stretch the decay (`transportTime` is not a clock —
    // CLAUDE.md; this reads `getEngineTime()` through the rAF loop).
    const coarse = pulse.update(GRID, 1.09);

    const fine = new BeatPulse();
    fine.update(GRID, 0.9);
    fine.update(GRID, 1);
    let level = 0;
    for (let i = 1; i <= 9; i++) level = fine.update(GRID, 1 + i * 0.01);

    expect(coarse).toBeCloseTo(fine.level, 6);
    expect(level).toBeCloseTo(
      Math.exp(-0.09 / PULSE_DECAY_TIME_CONSTANT_SECONDS),
      6,
    );
  });

  it('is fully decayed by the middle of a 120 BPM beat interval', () => {
    // The e2e's "absent mid-interval" assertion rests on this: a quarter
    // second after a beat at 120 BPM, the envelope must be below the
    // renderer's own visibility floor, or the two screenshots it compares
    // would show the same thing.
    const pulse = new BeatPulse();
    pulse.update(GRID, 0.9);
    pulse.update(GRID, 1);

    expect(pulse.update(GRID, 1.25)).toBeLessThan(MIN_VISIBLE_PULSE);
  });

  it('reset() clears the level and the phase, so a resume shows no stale decay', () => {
    // The #483 shape: `renderLoudnessMeterIdle` fires on every playback
    // discontinuity, and without a reset the meter resumes decaying the
    // envelope from before the pause.
    const pulse = new BeatPulse();
    pulse.update(GRID, 0.9);
    expect(pulse.update(GRID, 1)).toBe(1);

    pulse.reset();
    expect(pulse.level).toBe(0);

    // Resuming at the same moment the pause happened: no attack, no decay
    // tail — the first frame after a reset only re-establishes the phase.
    expect(pulse.update(GRID, 1)).toBe(0);
    expect(pulse.update(GRID, 1.02)).toBe(0);
  });

  it('does not re-attack a grid point already crossed before the reset', () => {
    const pulse = new BeatPulse();
    pulse.update(GRID, 0.9);
    pulse.update(GRID, 1);
    pulse.reset();

    // Seek back to just before the beat, then play through it again: this
    // one *must* attack, because it is a fresh crossing.
    pulse.update(GRID, 0.98);
    expect(pulse.update(GRID, 1.01)).toBeGreaterThan(0);
  });

  it('treats a backwards jump as a discontinuity rather than a crossing', () => {
    // Seeks route through `renderLoudnessMeterIdle` (which resets), but a
    // rewind landing between two frames of a still-running loop would
    // otherwise make the whole grid behind the new position "crossed".
    const pulse = new BeatPulse();
    pulse.update(GRID, 2.4);
    pulse.update(GRID, 2.51);

    expect(pulse.update(GRID, 0.2)).toBe(0);
  });

  it('never pulses without a grid — an anchorless project renders nothing', () => {
    const pulse = new BeatPulse();
    const transitions = traceTransitions(pulse, [], frames(0, 3, 1 / 60));

    expect(transitions).toEqual([]);
    expect(pulse.level).toBe(0);
  });

  it('ignores non-finite grid points instead of poisoning the envelope', () => {
    const pulse = new BeatPulse();
    const grid = [Number.NaN, 1, Number.POSITIVE_INFINITY];
    pulse.update(grid, 0.9);

    expect(pulse.update(grid, 1.01)).toBeGreaterThan(0);
    expect(Number.isFinite(pulse.level)).toBe(true);
  });
});
