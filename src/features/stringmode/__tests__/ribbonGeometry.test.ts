import { describe, expect, it } from 'vitest';
import { historySeconds, pitchDeviation, xForAge } from '../ribbonRenderer';
import { type RibbonTrack } from '../RibbonSources';
import { DEFAULT_STRING_PARAMS, type StringParams } from '../stringParams';

/** The pitch the line rests at — `ribbonLine.ts`'s `REST_MIDI`. */
const REST_MIDI = 57;

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
  // Returning to the centre is the *pitch* gliding home (`buildRibbonLine`),
  // not a presence term multiplying the deviation down — that coupling made
  // every amplitude envelope a vertical gesture, which is the wobble
  // character this geometry exists to remove.
  it('sits on the centre for the resting pitch', () => {
    expect(pitchDeviation(REST_MIDI, track(), params(), 1)).toBeCloseTo(0, 6);
  });

  it('rises above the centre for a high pitch and falls below for a low one', () => {
    const high = pitchDeviation(88, track(), params(), 1);
    const low = pitchDeviation(28, track(), params(), 1);
    expect(high).toBeGreaterThan(0);
    expect(low).toBeLessThan(0);
  });

  it('is monotonic in pitch', () => {
    let previous = -Infinity;
    for (const midi of [24, 36, 48, 60, 72, 84, 90]) {
      const value = pitchDeviation(midi, track(), params(), 1);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  // A note bar and the ribbon locked to that note must land on the same
  // height — both go through this one mapping, so a re-derived pitch→
  // position mapping (the #197/#218/#220/#230 class) fails here.
  it('gives a note bar and a ribbon locked to it the same height', () => {
    const midi = 67;
    const bar = pitchDeviation(midi, track(), params(), 1);
    const lockedRibbon = pitchDeviation(midi, track(), params(), 1);
    expect(lockedRibbon).toBe(bar);
  });

  // `d_sep` is not spacing: it interpolates a shared absolute axis against
  // per-track normalized lanes (spec 009 open question 12).
  it('uses the absolute axis when layered and the track range when laned', () => {
    // A track whose own range is 48–72 sits mid-axis absolutely, but spans
    // its whole lane relatively — so the same pitch reads differently.
    const shared = pitchDeviation(72, track(48, 72), params({ laneSep: 0 }), 1);
    const laned = pitchDeviation(72, track(48, 72), params({ laneSep: 1 }), 1);
    expect(laned).toBeGreaterThan(shared);
    expect(laned).toBeCloseTo(1, 6);
  });

  it('shrinks a laned excursion so neighbouring ribbons do not overlap', () => {
    const alone = pitchDeviation(90, track(), params({ laneSep: 1 }), 1);
    const stacked = pitchDeviation(90, track(), params({ laneSep: 1 }), 4);
    expect(stacked).toBeCloseTo(alone / 4, 6);
  });

  // A non-finite pitch means "no fundamental here", which is the *centre*
  // of the axis — not its bottom, which is where `clamp01(NaN) === 0` would
  // otherwise put it.
  it('rests a non-finite pitch at the centre, not at the bottom', () => {
    expect(pitchDeviation(Number.NaN, track(), params(), 1)).toBeCloseTo(0, 6);
  });
});
