import { describe, expect, it } from 'vitest';
import { type MelodyNote } from '../../transcription/MelodyExtractor';
import {
  activeNotesAt,
  buildPitchContour,
  contourPitchAt,
  dominantNoteAt,
  pitchAt,
  pitchBendAt,
  resolvedPitchAt,
} from '../pitchContour';

function note(overrides: Partial<MelodyNote> = {}): MelodyNote {
  return {
    startTime: 0,
    endTime: 1,
    midiNote: 60,
    confidence: 0.9,
    ...overrides,
  };
}

describe('buildPitchContour', () => {
  it('bridges the gap between two notes with no discontinuity', () => {
    const notes = [
      note({ startTime: 0, endTime: 0.5, midiNote: 60 }),
      note({ startTime: 1.5, endTime: 2, midiNote: 67 }),
    ];
    const contour = buildPitchContour(notes, 2);

    // Every step across the whole series stays small — a raw read off the
    // notes would jump 7 semitones at the boundary and collapse to nothing
    // through the rest.
    let largestStep = 0;
    for (let i = 1; i < contour.raw.length; i++) {
      largestStep = Math.max(
        largestStep,
        Math.abs(contour.raw[i] - contour.raw[i - 1]),
      );
    }
    expect(largestStep).toBeLessThan(1);
    expect(contour.raw.every(Number.isFinite)).toBe(true);
  });

  it('holds the note pitch until the gap is genuinely underway', () => {
    const notes = [
      note({ startTime: 0, endTime: 0.5, midiNote: 60 }),
      note({ startTime: 1.5, endTime: 2, midiNote: 72 }),
    ];
    const contour = buildPitchContour(notes, 2);

    // The smoothstep window sits in the middle of the gap (w = clamp((u −
    // 0.35) / 0.3)), so a fifth of the way in nothing has moved yet.
    expect(contourPitchAt(contour, 0.7, 0)).toBeCloseTo(60, 3);
    expect(contourPitchAt(contour, 1.4, 0)).toBeCloseTo(72, 3);
  });

  it('`glide` blends stepped against smoothed', () => {
    const notes = [
      note({ startTime: 0, endTime: 0.4, midiNote: 60 }),
      note({ startTime: 0.4, endTime: 0.8, midiNote: 64 }),
    ];
    const contour = buildPitchContour(notes, 0.8);

    const stepped = contourPitchAt(contour, 0.39, 0);
    const smooth = contourPitchAt(contour, 0.39, 1);
    const blended = contourPitchAt(contour, 0.39, 0.5);

    expect(stepped).toBeCloseTo(60, 6);
    // Box smoothing over ±0.22 s straddles the boundary, so the smoothed
    // series has already started moving where the stepped one has not.
    expect(smooth).toBeGreaterThan(stepped);
    expect(blended).toBeCloseTo((stepped + smooth) / 2, 6);
  });

  it('reports no pitch when there are no notes', () => {
    const contour = buildPitchContour([], 5);
    expect(contour.hasPitch).toBe(false);
    expect(contourPitchAt(contour, 1, 0.4)).toBeNaN();
  });
});

describe('pitchBendAt', () => {
  it('reads per-frame deviation in semitones from the note base', () => {
    const bent = note({ startTime: 0, endTime: 1, pitchBends: [0, 0.5, -0.5] });
    expect(pitchBendAt(bent, 0)).toBeCloseTo(0, 6);
    expect(pitchBendAt(bent, 0.5)).toBeCloseTo(0.5, 6);
    expect(pitchBendAt(bent, 1)).toBeCloseTo(-0.5, 6);
  });

  it('is zero for a note with no bends', () => {
    expect(pitchBendAt(note(), 0.5)).toBe(0);
  });
});

describe('pitchAt', () => {
  const bent = note({
    startTime: 0,
    endTime: 1,
    midiNote: 60,
    pitchBends: [0, 0.4, 0.4],
  });

  // The design Decision 6 rejects is locking to `note.midiNote` alone: it
  // discards exactly the information the ribbon exists to carry, precisely
  // where that information lives. This test fails against that design.
  it('locks to midiNote + pitchBend, not to midiNote alone', () => {
    const contour = buildPitchContour([bent], 1);
    const resolved = pitchAt([bent], contour, 0.5, 1, 0, 1);

    expect(resolved.pitch).toBeCloseTo(60.4, 6);
    expect(resolved.pitch).not.toBeCloseTo(60, 2);
    expect(resolved.locked?.note).toBe(bent);
  });

  it('scales the departure from the note line by bend_scale', () => {
    const contour = buildPitchContour([bent], 1);
    expect(pitchAt([bent], contour, 0.5, 1, 0, 2).pitch).toBeCloseTo(60.8, 6);
    // bend_scale = 0 collapses to the quantised note — the rejected design,
    // reachable only by explicitly asking for it.
    expect(pitchAt([bent], contour, 0.5, 1, 0, 0).pitch).toBeCloseTo(60, 6);
  });

  it('lock = 0 leaves the ribbon on the contour with the bar still there', () => {
    const notes = [
      note({ startTime: 0, endTime: 0.3, midiNote: 60 }),
      note({ startTime: 0.7, endTime: 1, midiNote: 72, pitchBends: [1, 1] }),
    ];
    const contour = buildPitchContour(notes, 1);

    const locked = pitchAt(notes, contour, 0.85, 1, 0, 1);
    const unlocked = pitchAt(notes, contour, 0.85, 0, 0, 1);

    expect(locked.pitch).toBeCloseTo(73, 6);
    expect(unlocked.pitch).toBeCloseTo(contourPitchAt(contour, 0.85, 0), 6);
    // The bar is still reported either way — `lock = 0` is a plain overlay.
    expect(unlocked.active).toHaveLength(1);
  });

  it('falls through to the contour where no note is active', () => {
    const notes = [
      note({ startTime: 0, endTime: 0.3, midiNote: 60 }),
      note({ startTime: 0.7, endTime: 1, midiNote: 64 }),
    ];
    const contour = buildPitchContour(notes, 1);
    const resolved = pitchAt(notes, contour, 0.5, 0.85, 0.4, 1);

    expect(resolved.locked).toBeNull();
    expect(resolved.pitch).toBeCloseTo(contourPitchAt(contour, 0.5, 0.4), 6);
  });

  // Polyphony: render all, lock to one. Keeps the ribbon a single stream
  // (Bregman) while showing honestly that there was more than one voice.
  it('reports every overlapping note but locks to the most confident', () => {
    const quiet = note({ midiNote: 60, confidence: 0.4 });
    const sure = note({ midiNote: 64, confidence: 0.95 });
    const contour = buildPitchContour([quiet, sure], 1);

    const active = activeNotesAt([quiet, sure], 0.5, 1);
    expect(active).toHaveLength(2);
    expect(dominantNoteAt(active)?.note).toBe(sure);

    const resolved = pitchAt([quiet, sure], contour, 0.5, 1, 0, 1);
    expect(resolved.active).toHaveLength(2);
    expect(resolved.pitch).toBeCloseTo(64, 6);
  });

  it('returns NaN where there is neither a note nor a contour', () => {
    const contour = buildPitchContour([], 1);
    expect(pitchAt([], contour, 0.5, 1, 0, 1).pitch).toBeNaN();
  });
});

describe('resolvedPitchAt', () => {
  // The per-frame fast path is a second implementation of `pitchAt`'s
  // semantics (array lookup, no note scan, no allocation — `/code-review`
  // on PR #594). This pins the two to each other so the one the renderer
  // actually calls cannot silently drift from the documented one.
  it('agrees with pitchAt across a polyphonic take', () => {
    const notes = [
      note({ startTime: 0, endTime: 0.4, midiNote: 60, confidence: 0.9 }),
      note({
        startTime: 0.2,
        endTime: 0.6,
        midiNote: 67,
        confidence: 0.5,
        pitchBends: [0, 0.3, -0.2],
      }),
      note({ startTime: 1.0, endTime: 1.4, midiNote: 72, confidence: 0.8 }),
    ];
    const contour = buildPitchContour(notes, 1.6);

    for (const [lock, glide, bendScale] of [
      [1, 0, 1],
      [0, 0.4, 1],
      [0.85, 0.4, 2],
    ]) {
      for (let i = 0; i < 160; i++) {
        const t = i * contour.hop;
        const reference = pitchAt(notes, contour, t, lock, glide, bendScale);
        const fast = resolvedPitchAt(contour, t, lock, glide, bendScale);
        if (Number.isNaN(reference.pitch)) {
          expect(fast).toBeNaN();
        } else {
          expect(fast).toBeCloseTo(reference.pitch, 5);
        }
      }
    }
  });

  it('is NaN outside the take, so callers fall back to the centroid', () => {
    const contour = buildPitchContour([note({ endTime: 0.5 })], 0.5);
    expect(resolvedPitchAt(contour, -1, 1, 0, 1)).toBeNaN();
    expect(resolvedPitchAt(contour, 99, 1, 0, 1)).toBeNaN();
  });
});
