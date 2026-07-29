import { describe, expect, it } from 'vitest';
import { BAND_COUNT, extractEnvelopes, frameIndexAt } from '../envelopes';

const BIN_COUNT = 64;
const HOP = 0.025;

/** A frame with a single strong bin — a tone at `bin`. */
function toneFrame(bin: number, byte = 255): Uint8Array {
  const frame = new Uint8Array(BIN_COUNT);
  frame[bin] = byte;
  return frame;
}

/** A frame of low-level dither — below the silence threshold everywhere. */
function silentFrame(): Uint8Array {
  const frame = new Uint8Array(BIN_COUNT);
  for (let k = 0; k < BIN_COUNT; k++) frame[k] = k % 3;
  return frame;
}

function bandsOf(bands: Uint8Array, frame: number): number[] {
  return Array.from(
    bands.subarray(frame * BAND_COUNT, (frame + 1) * BAND_COUNT),
  );
}

describe('extractEnvelopes', () => {
  it('normalizes level to the track peak and curves it', () => {
    const envelopes = extractEnvelopes(
      [toneFrame(10, 255), toneFrame(10, 64), silentFrame()],
      HOP,
    );

    // Raw RMS over 64 bins never approaches 1 even for a full-scale bin —
    // which is exactly why `level` exists (`/code-review`; the ribbon
    // rendered as an invisible hairline off raw RMS).
    expect(envelopes.rms[0]).toBeLessThan(0.2);
    expect(envelopes.level[0]).toBeCloseTo(1, 6);
    // 0.6 power curve: a quarter-amplitude frame reads well above a quarter.
    expect(envelopes.level[1]).toBeGreaterThan(0.25);
    expect(envelopes.level[1]).toBeLessThan(1);
  });

  it('reports a level of zero for a track with no signal at all', () => {
    const envelopes = extractEnvelopes([new Uint8Array(BIN_COUNT)], HOP);
    expect(envelopes.level[0]).toBe(0);
  });

  // Without the silence guard, `poolBands` normalizes *every* frame to its
  // own peak — so a silent frame's dither renders a full-contrast
  // cross-section (`/code-review` on PR #594).
  it('leaves the band vector empty for a silent frame', () => {
    const envelopes = extractEnvelopes([toneFrame(10), silentFrame()], HOP);

    expect(Math.max(...bandsOf(envelopes.bands, 0))).toBe(255);
    expect(Math.max(...bandsOf(envelopes.bands, 1))).toBe(0);
  });

  it('leaves centroid and flatness at zero and f0 absent when silent', () => {
    const envelopes = extractEnvelopes([silentFrame()], HOP);
    expect(envelopes.centroid[0]).toBe(0);
    expect(envelopes.flatness[0]).toBe(0);
    expect(envelopes.f0Bin[0]).toBeNaN();
  });

  it('puts a higher tone in a higher band and reports a higher centroid', () => {
    const low = extractEnvelopes([toneFrame(4)], HOP);
    const high = extractEnvelopes([toneFrame(60)], HOP);

    expect(high.centroid[0]).toBeGreaterThan(low.centroid[0]);
    expect(bandsOf(low.bands, 0).indexOf(255)).toBeLessThan(
      bandsOf(high.bands, 0).indexOf(255),
    );
  });

  it('rectifies flux — a rise registers, a fall does not', () => {
    const envelopes = extractEnvelopes(
      [new Uint8Array(BIN_COUNT), toneFrame(10), new Uint8Array(BIN_COUNT)],
      HOP,
    );
    expect(envelopes.flux[1]).toBeGreaterThan(0);
    expect(envelopes.flux[2]).toBe(0);
  });

  // Not clamped to the last frame: a finished track must read as silent,
  // or its final loudness would hold on the ribbon for the whole project.
  it('reports no frame outside the take', () => {
    const envelopes = extractEnvelopes([toneFrame(10), toneFrame(10)], HOP);
    expect(frameIndexAt(envelopes, 0)).toBe(0);
    expect(frameIndexAt(envelopes, -0.1)).toBe(-1);
    expect(frameIndexAt(envelopes, 10)).toBe(-1);
  });
});
