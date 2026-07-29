import { describe, expect, it } from 'vitest';
import { historySeconds, pitchDeviation, xForAge } from '../ribbonRenderer';
import { type RibbonTrack } from '../RibbonSources';
import { DEFAULT_STRING_PARAMS, type StringParams } from '../stringParams';

function params(overrides: Partial<StringParams> = {}): StringParams {
  return { ...DEFAULT_STRING_PARAMS, ...overrides };
}

/** Only the fields `pitchDeviation` reads. */
function track(pitchLo = 48, pitchHi = 72): RibbonTrack {
  return { pitchLo, pitchHi } as RibbonTrack;
}

describe('xForAge', () => {
  // "When the signal … enters the screen at the right" — age 0 is now, and
  // now is the right edge; content ages leftward.
  it('puts now at the right edge and the oldest content at the left', () => {
    expect(xForAge(0, 420)).toBe(420);
    expect(xForAge(1, 420)).toBe(0);
    expect(xForAge(0.5, 420)).toBe(210);
  });
});

describe('historySeconds', () => {
  // The rate of change on the horizontal axis is the pinch-to-zoom signal,
  // exactly as on the runway — not a parameter of its own.
  it('is the viewport width divided by the zoom', () => {
    expect(
      historySeconds({ width: 400, height: 800, pixelsPerSecond: 200 }),
    ).toBe(2);
    expect(
      historySeconds({ width: 400, height: 800, pixelsPerSecond: 50 }),
    ).toBe(8);
  });

  it('holds a shorter history as the zoom increases', () => {
    const zoomedOut = historySeconds({
      width: 400,
      height: 800,
      pixelsPerSecond: 50,
    });
    const zoomedIn = historySeconds({
      width: 400,
      height: 800,
      pixelsPerSecond: 800,
    });
    expect(zoomedIn).toBeLessThan(zoomedOut);
  });

  it('survives a zero zoom rather than returning Infinity', () => {
    const history = historySeconds({
      width: 400,
      height: 800,
      pixelsPerSecond: 0,
    });
    expect(Number.isFinite(history)).toBe(true);
  });
});

describe('pitchDeviation', () => {
  it('is zero at rest — the line sits on the centre', () => {
    // No presence: whatever the held pitch, the ribbon is on the middle.
    expect(pitchDeviation(84, 0, track(), params(), 1)).toBeCloseTo(0, 10);
    expect(pitchDeviation(30, 0, track(), params(), 1)).toBeCloseTo(0, 10);
  });

  it('rises above the centre for a high pitch and falls below for a low one', () => {
    const high = pitchDeviation(88, 1, track(), params(), 1);
    const low = pitchDeviation(28, 1, track(), params(), 1);
    expect(high).toBeGreaterThan(0);
    expect(low).toBeLessThan(0);
  });

  it('is monotonic in pitch', () => {
    let previous = -Infinity;
    for (const midi of [24, 36, 48, 60, 72, 84, 90]) {
      const value = pitchDeviation(midi, 1, track(), params(), 1);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it('scales smoothly with presence, so the release is a glide not a jump', () => {
    const full = pitchDeviation(84, 1, track(), params(), 1);
    const half = pitchDeviation(84, 0.5, track(), params(), 1);
    expect(half).toBeCloseTo(full / 2, 10);
  });

  // A note bar and the ribbon locked to that note must land on the same
  // height — both go through this one mapping, so a re-derived pitch→
  // position mapping (the #197/#218/#220/#230 class) fails here.
  it('gives a note bar and a ribbon locked to it the same height', () => {
    const midi = 67;
    const bar = pitchDeviation(midi, 1, track(), params(), 1);
    const lockedRibbon = pitchDeviation(midi, 1, track(), params(), 1);
    expect(lockedRibbon).toBe(bar);
  });

  // `d_sep` is not spacing: it interpolates a shared absolute axis against
  // per-track normalized lanes (spec 009 open question 12).
  it('uses the absolute axis when layered and the track range when laned', () => {
    // A track whose own range is 48–72 sits mid-axis absolutely, but spans
    // its whole lane relatively — so the same pitch reads differently.
    const shared = pitchDeviation(
      72,
      1,
      track(48, 72),
      params({ laneSep: 0 }),
      1,
    );
    const laned = pitchDeviation(
      72,
      1,
      track(48, 72),
      params({ laneSep: 1 }),
      1,
    );
    expect(laned).toBeGreaterThan(shared);
    expect(laned).toBeCloseTo(1, 6);
  });

  it('shrinks a laned excursion so neighbouring ribbons do not overlap', () => {
    const alone = pitchDeviation(90, 1, track(), params({ laneSep: 1 }), 1);
    const stacked = pitchDeviation(90, 1, track(), params({ laneSep: 1 }), 4);
    expect(stacked).toBeCloseTo(alone / 4, 6);
  });

  it('is NaN-safe', () => {
    expect(pitchDeviation(Number.NaN, 1, track(), params(), 1)).toBeCloseTo(
      0,
      6,
    );
    expect(pitchDeviation(60, Number.NaN, track(), params(), 1)).toBeCloseTo(
      0,
      10,
    );
  });
});
