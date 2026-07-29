import { describe, expect, it } from 'vitest';
import { extractEnvelopes, type TrackEnvelopes } from '../envelopes';
import {
  buildRibbonLine,
  makeLineSample,
  sampleRibbonLine,
} from '../ribbonLine';
import { DEFAULT_STRING_PARAMS, type StringParams } from '../stringParams';

const BIN_COUNT = 64;
const HOP = 0.025;

function params(overrides: Partial<StringParams> = {}): StringParams {
  return { ...DEFAULT_STRING_PARAMS, ...overrides };
}

/** A frame at a given bin and byte level. */
function frame(bin: number, byte: number): Uint8Array {
  const out = new Uint8Array(BIN_COUNT);
  if (byte > 0) out[bin] = byte;
  return out;
}

const SILENT = () => new Uint8Array(BIN_COUNT);

/**
 * `n` silent frames, then `m` loud ones at `bin` — a hard onset, which is
 * what the adaptive follower should treat as a sharp attack.
 */
function gatedEnvelopes(silence: number, sound: number, bin = 30) {
  const frames: Uint8Array[] = [];
  for (let i = 0; i < silence; i++) frames.push(SILENT());
  for (let i = 0; i < sound; i++) frames.push(frame(bin, 255));
  return extractEnvelopes(frames, HOP);
}

function sampleAt(line: ReturnType<typeof buildRibbonLine>, time: number) {
  return sampleRibbonLine(line, time, makeLineSample());
}

/** Constant pitch for every frame — isolates the follower from the source. */
const constantPitch = (midi: number) => () => midi;

describe('buildRibbonLine', () => {
  it('rests at the centre with no presence, width or colour when silent', () => {
    const envelopes = extractEnvelopes([SILENT(), SILENT(), SILENT()], HOP);
    const line = buildRibbonLine(envelopes, constantPitch(72), params());

    const sample = sampleAt(line, HOP);
    expect(sample.presence).toBe(0);
    expect(sample.level).toBe(0);
    expect(sample.brightness).toBe(0);
  });

  // "When the signal (above the noise floor) enters the screen … the ribbon
  // rises/falls to match the fundamental pitch of the signal."
  it('rises toward the signal pitch once it crosses the noise floor', () => {
    const envelopes = gatedEnvelopes(4, 40);
    const line = buildRibbonLine(envelopes, constantPitch(76), params());

    const atRest = sampleAt(line, 0);
    const settled = sampleAt(line, HOP * 40);

    expect(atRest.presence).toBe(0);
    expect(settled.presence).toBeGreaterThan(0.9);
    expect(settled.midi).toBeGreaterThan(70);
    expect(settled.pitch01).toBeGreaterThan(atRest.pitch01);
  });

  it('falls below the centre for a low fundamental and rises above for a high one', () => {
    const envelopes = gatedEnvelopes(2, 60);
    const low = buildRibbonLine(envelopes, constantPitch(36), params());
    const high = buildRibbonLine(envelopes, constantPitch(84), params());

    expect(sampleAt(low, HOP * 60).pitch01).toBeLessThan(0.5);
    expect(sampleAt(high, HOP * 60).pitch01).toBeGreaterThan(0.5);
  });

  it('returns to the centre after the signal stops', () => {
    const frames = [
      ...Array.from({ length: 30 }, () => frame(30, 255)),
      ...Array.from({ length: 60 }, SILENT),
    ];
    const line = buildRibbonLine(
      extractEnvelopes(frames, HOP),
      constantPitch(80),
      params(),
    );

    expect(sampleAt(line, HOP * 29).presence).toBeGreaterThan(0.8);
    expect(sampleAt(line, HOP * 89).presence).toBeLessThan(0.05);
  });

  // "suitable attack/release transients (a sharp attack/release should have
  // a short transient/interpolation, a slow the contrary)"
  it('reaches the target faster on a sharp attack than on a slow swell', () => {
    const sharp = gatedEnvelopes(4, 40);
    // A ramp over ~0.5 s — same destination, no transient to detect.
    const rampFrames = [
      ...Array.from({ length: 4 }, SILENT),
      ...Array.from({ length: 20 }, (_, i) =>
        frame(30, Math.round(255 * ((i + 1) / 20))),
      ),
      ...Array.from({ length: 20 }, () => frame(30, 255)),
    ];
    const swell = extractEnvelopes(rampFrames, HOP);

    const settings = params();
    const sharpLine = buildRibbonLine(sharp, constantPitch(80), settings);
    const swellLine = buildRibbonLine(swell, constantPitch(80), settings);

    // Two frames after each crosses the floor, the sharp one is much
    // further along.
    const sharpEarly = sampleAt(sharpLine, HOP * 8).presence;
    const swellEarly = sampleAt(swellLine, HOP * 8).presence;
    expect(sharpEarly).toBeGreaterThan(swellEarly);
  });

  it('holds its pitch through an unvoiced gap rather than snapping to centre', () => {
    // Present throughout, but the fundamental drops out in the middle.
    const envelopes = gatedEnvelopes(2, 60);
    const line = buildRibbonLine(
      envelopes,
      (t) => (t > 0.5 && t < 0.8 ? Number.NaN : 78),
      params(),
    );

    // Inside the gap the line still carries the held pitch and keeps
    // converging on it — it must not retreat toward the resting pitch.
    // Returning to the middle is `presence`'s job, and the signal is still
    // present here.
    const beforeGap = sampleAt(line, 0.49);
    const inGap = sampleAt(line, 0.65);
    const afterGap = sampleAt(line, 0.85);

    expect(inGap.midi).toBeGreaterThanOrEqual(beforeGap.midi);
    expect(afterGap.midi).toBeGreaterThanOrEqual(inGap.midi);
    expect(inGap.midi).toBeGreaterThan(70);
    expect(inGap.presence).toBeGreaterThan(0.9);
  });

  it('is a pure function of its inputs', () => {
    const envelopes = gatedEnvelopes(4, 40);
    const first = buildRibbonLine(envelopes, constantPitch(72), params());
    const second = buildRibbonLine(envelopes, constantPitch(72), params());
    expect(Array.from(second.midi)).toEqual(Array.from(first.midi));
    expect(Array.from(second.presence)).toEqual(Array.from(first.presence));
  });

  it('raises the noise floor to exclude quiet material', () => {
    // A quiet steady tone: present under a low floor, gone under a high one.
    const envelopes = extractEnvelopes(
      [
        ...Array.from({ length: 4 }, () => frame(30, 255)),
        ...Array.from({ length: 40 }, () => frame(30, 40)),
      ],
      HOP,
    );

    const permissive = buildRibbonLine(
      envelopes,
      constantPitch(72),
      params({ noiseFloor: 0.01 }),
    );
    const strict = buildRibbonLine(
      envelopes,
      constantPitch(72),
      params({ noiseFloor: 0.5 }),
    );

    expect(sampleAt(permissive, HOP * 43).presence).toBeGreaterThan(0.5);
    expect(sampleAt(strict, HOP * 43).presence).toBeLessThan(0.1);
  });

  it('rests outside the take rather than clamping to its last value', () => {
    const line = buildRibbonLine(
      gatedEnvelopes(2, 20),
      constantPitch(84),
      params(),
    );
    const past = sampleAt(line, 1000);
    expect(past.presence).toBe(0);
    expect(past.level).toBe(0);
  });

  it('handles a track with no frames at all', () => {
    const empty: TrackEnvelopes = extractEnvelopes([], HOP);
    const line = buildRibbonLine(empty, constantPitch(60), params());
    expect(line.frameCount).toBe(0);
    expect(sampleAt(line, 0).presence).toBe(0);
  });
});

describe('the pitch-stability gate', () => {
  // Measured through this very pass on `test-click-120bpm.wav`: a click's
  // loud frames read flatness ~0.03 (median) against a steady tone's
  // 0.0065, so flatness cannot separate percussive from tonal here. What
  // separates them is whether the estimate *holds* frame to frame.
  it('ignores an estimate that jumps, and follows one that holds', () => {
    const envelopes = gatedEnvelopes(2, 60);
    const settings = params({ pitchStability: 2 });

    const steady = buildRibbonLine(envelopes, constantPitch(80), settings);
    // A jumping estimate — a fresh, unrelated "pitch" every frame, which is
    // what the centroid fallback produces on percussive material.
    let n = 0;
    const jumpy = buildRibbonLine(
      envelopes,
      () => 40 + ((n++ * 37) % 45),
      settings,
    );

    expect(sampleAt(steady, HOP * 60).midi).toBeGreaterThan(75);
    // The jumpy one never leaves the resting pitch.
    expect(sampleAt(jumpy, HOP * 60).midi).toBeCloseTo(57, 0);
  });

  it('opens up when the tolerance is widened', () => {
    const envelopes = gatedEnvelopes(2, 60);
    let n = 0;
    const loose = buildRibbonLine(
      envelopes,
      () => 40 + ((n++ * 37) % 45),
      params({ pitchStability: 12 }),
    );
    expect(sampleAt(loose, HOP * 60).midi).not.toBeCloseTo(57, 0);
  });

  // Height is pitch and only pitch: the release returns the line to the
  // centre by gliding the *pitch* home, not by scaling the deviation with
  // amplitude — that coupling made every envelope a vertical gesture.
  it('glides the pitch home below the noise floor', () => {
    const frames = [
      ...Array.from({ length: 40 }, () => frame(30, 255)),
      ...Array.from({ length: 80 }, SILENT),
    ];
    const line = buildRibbonLine(
      extractEnvelopes(frames, HOP),
      constantPitch(84),
      params(),
    );

    expect(sampleAt(line, HOP * 39).midi).toBeGreaterThan(75);
    expect(sampleAt(line, HOP * 119).midi).toBeCloseTo(57, 0);
  });
});
