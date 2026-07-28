// SPIKE (mawimbi#593) — discrete notes → a continuous pitch series, and
// the note-lock that reads from it (spec 009 Decision 6 + Decision 3's
// [PROTO] contour module).
//
// Two things here, in the order spec 009's milestone 4 puts them:
//
// 1. `buildPitchContour` turns `MelodyNote[]` — a list of rectangles *with
//    gaps* — into two evenly-sampled series, raw and smoothed. Without it a
//    ribbon reading height straight off the notes collapses at every rest
//    and jumps at every note boundary, which cannot show *contour*, the one
//    thing Dowling licenses the design on.
//
// 2. `pitchAt` locks the ribbon to `note.midiNote + pitchBend(τ)·bend_scale`
//    while a note is overhead, falling through to the contour in the gaps.
//    Locking to `note.midiNote` alone would be the design spec 009
//    explicitly rejects: vibrato, portamento, drift and intonation all
//    happen *inside* sustained notes, so a ribbon that snaps to integer
//    semitones is a piano roll during notes and a contour only between
//    them. The bar is the reference; the ribbon's distance from it is the
//    performance.
//
// **All times here are track-buffer-relative.** `MelodyNote.startTime` is
// 0-based within the track's own buffer and is never offset by the track's
// position in the project timeline (`kb/domain.md`, #484) — callers convert
// with `projectTime − track.startTime` before entering this module, and
// `RibbonSources` is the one place that conversion happens.

import { type MelodyNote } from '../transcription/MelodyExtractor';

/** Contour sample rate — the prototype's `SR`, 100 Hz. */
export const CONTOUR_HOP_SECONDS = 0.01;

/** Box-smoothing radius in seconds — the prototype's ±0.22 s. */
const SMOOTH_RADIUS_SECONDS = 0.22;

/** Box-smoothing passes; three of them approximate a Gaussian. */
const SMOOTH_PASSES = 3;

/**
 * Smoothstep window across a gap. The prototype's `w = clamp((u − 0.35) /
 * 0.3)` puts the whole transition in the middle of the gap rather than
 * smearing it across the full span, so a note holds its own pitch until it
 * is genuinely over.
 */
const GAP_TRANSITION_START = 0.35;
const GAP_TRANSITION_SPAN = 0.3;

export type PitchContour = {
  hop: number;
  /** Stepped, note-accurate pitch (MIDI), gap-filled. */
  raw: Float32Array;
  /** Box-smoothed pitch (MIDI). */
  smooth: Float32Array;
  /**
   * Per-sample dominant note pitch (MIDI), `NaN` where no note is active —
   * the note-lock's target, pre-resolved so the per-frame path never scans
   * the note list. Paired with `noteBend`, which holds that note's bend in
   * semitones *unscaled*, so `bend_scale` stays a live parameter.
   */
  noteMidi: Float32Array;
  noteBend: Float32Array;
  /** False when there were no notes at all — callers fall back to centroid. */
  hasPitch: boolean;
};

export const EMPTY_PITCH_CONTOUR: PitchContour = {
  hop: CONTOUR_HOP_SECONDS,
  raw: new Float32Array(0),
  smooth: new Float32Array(0),
  noteMidi: new Float32Array(0),
  noteBend: new Float32Array(0),
  hasPitch: false,
};

/**
 * Builds the gap-filled raw and smoothed pitch series for one track.
 *
 * Keeps **both** series rather than picking one: `glide = 0` is stepped,
 * note-accurate pitch and `glide = 1` is a smooth vocal-like contour, and
 * which reads better is a spike question, not a constant to pick blind.
 */
export function buildPitchContour(
  notes: MelodyNote[],
  durationSeconds: number,
): PitchContour {
  const hop = CONTOUR_HOP_SECONDS;
  const sampleCount = Math.max(1, Math.ceil(durationSeconds / hop));
  if (notes.length === 0) return EMPTY_PITCH_CONTOUR;

  const raw = new Float32Array(sampleCount).fill(Number.NaN);
  const noteMidi = new Float32Array(sampleCount).fill(Number.NaN);
  const noteBend = new Float32Array(sampleCount);
  const bestConfidence = new Float32Array(sampleCount);

  for (const note of notes) {
    const start = Math.max(0, Math.floor(note.startTime / hop));
    const end = Math.min(sampleCount, Math.ceil(note.endTime / hop));
    for (let i = start; i < end; i++) {
      // Polyphony: render all bars, lock to the highest-confidence note.
      // Resolved here, once per melody, so the per-frame path is an array
      // index rather than a scan of every note (`/code-review` on PR #594).
      const unset = Number.isNaN(noteMidi[i]);
      if (!unset && note.confidence <= bestConfidence[i]) continue;
      noteMidi[i] = note.midiNote;
      noteBend[i] = pitchBendAt(note, i * hop);
      bestConfidence[i] = note.confidence;
      raw[i] = noteMidi[i] + noteBend[i];
    }
  }

  fillGaps(raw);
  const smooth = boxSmooth(raw, Math.round(SMOOTH_RADIUS_SECONDS / hop));
  return { hop, raw, smooth, noteMidi, noteBend, hasPitch: true };
}

/**
 * The per-frame pitch read: `pitchAt`'s semantics at the contour's own
 * sample rate, as an O(1) array lookup with no allocation.
 *
 * The renderer calls this ~195× per ribbon per frame (every sample point,
 * every gradient stop, every packet, and the forcing term). Going through
 * `pitchAt` there scanned the whole note list and allocated an array on
 * every one of those calls — ~230k comparisons and ~800 allocations per
 * frame at 4 tracks × 300 notes, which the HUD's own `ms` readout would
 * then have been measuring (`/code-review` on PR #594).
 *
 * `resolvedPitchAgreesWithPitchAt` in the tests pins the two to each other
 * so the fast path cannot drift from the reference semantics.
 */
export function resolvedPitchAt(
  contour: PitchContour,
  trackTime: number,
  lock: number,
  glide: number,
  bendScale: number,
): number {
  if (!contour.hasPitch) return Number.NaN;
  const index = Math.round(trackTime / contour.hop);
  if (index < 0 || index >= contour.raw.length) return Number.NaN;

  const raw = contour.raw[index];
  const contourPitch = Number.isNaN(raw)
    ? Number.NaN
    : raw * (1 - glide) + contour.smooth[index] * glide;

  const midi = contour.noteMidi[index];
  if (Number.isNaN(midi)) return contourPitch;

  const locked = midi + contour.noteBend[index] * bendScale;
  if (Number.isNaN(contourPitch)) return locked;
  return contourPitch * (1 - lock) + locked * lock;
}

/**
 * Per-frame deviation in semitones from the note's base pitch — the same
 * interpretation `PianoRollRenderer.drawPitchBendLine` already applies.
 */
export function pitchBendAt(note: MelodyNote, trackTime: number): number {
  const bends = note.pitchBends;
  if (!bends || bends.length === 0) return 0;
  const span = note.endTime - note.startTime;
  if (span <= 0) return bends[0];
  const fraction = (trackTime - note.startTime) / span;
  const index = Math.round(fraction * (bends.length - 1));
  return bends[Math.min(bends.length - 1, Math.max(0, index))];
}

/**
 * Interpolates across every `NaN` run with a smoothstep, and holds the
 * edge value outside the first and last note.
 */
function fillGaps(series: Float32Array): void {
  const length = series.length;
  let index = 0;
  while (index < length) {
    if (!Number.isNaN(series[index])) {
      index++;
      continue;
    }
    const gapStart = index;
    while (index < length && Number.isNaN(series[index])) index++;
    const gapEnd = index; // first defined sample after the gap

    const before = gapStart > 0 ? series[gapStart - 1] : Number.NaN;
    const after = gapEnd < length ? series[gapEnd] : Number.NaN;

    if (Number.isNaN(before) && Number.isNaN(after)) return; // all-NaN
    const from = Number.isNaN(before) ? after : before;
    const to = Number.isNaN(after) ? before : after;

    const span = gapEnd - gapStart;
    for (let i = gapStart; i < gapEnd; i++) {
      const u = span <= 1 ? 1 : (i - gapStart) / (span - 1);
      series[i] = from + (to - from) * smoothstepWindow(u);
    }
  }
}

function smoothstepWindow(u: number): number {
  const w = clamp01((u - GAP_TRANSITION_START) / GAP_TRANSITION_SPAN);
  return w * w * (3 - 2 * w);
}

function boxSmooth(series: Float32Array, radius: number): Float32Array {
  if (radius < 1 || series.length === 0) return Float32Array.from(series);
  let current = Float32Array.from(series);
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const next = new Float32Array(current.length);
    for (let i = 0; i < current.length; i++) {
      let sum = 0;
      let count = 0;
      const start = Math.max(0, i - radius);
      const end = Math.min(current.length - 1, i + radius);
      for (let j = start; j <= end; j++) {
        sum += current[j];
        count++;
      }
      next[i] = sum / count;
    }
    current = next;
  }
  return current;
}

/** Reads the blended contour at a track-buffer-relative time. */
export function contourPitchAt(
  contour: PitchContour,
  trackTime: number,
  glide: number,
): number {
  if (!contour.hasPitch) return Number.NaN;
  const index = Math.round(trackTime / contour.hop);
  if (index < 0 || index >= contour.raw.length) return Number.NaN;
  const raw = contour.raw[index];
  const smooth = contour.smooth[index];
  if (Number.isNaN(raw)) return Number.NaN;
  return raw * (1 - glide) + smooth * glide;
}

export type ActiveNote = { note: MelodyNote; pitch: number };

/**
 * Every note sounding at `trackTime`, plus the pitch each would lock to.
 *
 * Polyphony: **render all, lock to one.** Basic Pitch is polyphonic and
 * returns overlapping notes, so "the note" is not always singular — all
 * active notes get a bar, and `pitchAt` locks to the highest-confidence
 * one, keeping the ribbon a single stream (Bregman) while showing honestly
 * that there was more than one voice.
 */
export function activeNotesAt(
  notes: MelodyNote[],
  trackTime: number,
  bendScale: number,
): ActiveNote[] {
  const active: ActiveNote[] = [];
  for (const note of notes) {
    if (trackTime < note.startTime || trackTime >= note.endTime) continue;
    active.push({
      note,
      pitch: note.midiNote + pitchBendAt(note, trackTime) * bendScale,
    });
  }
  return active;
}

/** The highest-confidence active note, or null. */
export function dominantNoteAt(active: ActiveNote[]): ActiveNote | null {
  let best: ActiveNote | null = null;
  for (const candidate of active) {
    if (!best || candidate.note.confidence > best.note.confidence) {
      best = candidate;
    }
  }
  return best;
}

export type PitchResolution = {
  /** MIDI pitch, or `NaN` when neither a note nor a contour is available. */
  pitch: number;
  /** The note the ribbon is locked to, if any. */
  locked: ActiveNote | null;
  /** Every note sounding here — all of them get a bar. */
  active: ActiveNote[];
};

/**
 * Resolves the ribbon's pitch at a track-buffer-relative time.
 *
 * `lock = 1` sits exactly on `midiNote + pitchBend·bend_scale`;
 * `lock = 0` is a legal value and leaves the ribbon on the contour with the
 * bars still drawn — an overlay in the plain sense. That parameter is the
 * answer to the Product dissent in Decision 6: locking is a claim that the
 * transcription is right, and Basic Pitch on real polyphonic material is
 * not reliable enough for that claim to be unconditional.
 */
export function pitchAt(
  notes: MelodyNote[],
  contour: PitchContour,
  trackTime: number,
  lock: number,
  glide: number,
  bendScale: number,
): PitchResolution {
  const active = activeNotesAt(notes, trackTime, bendScale);
  const locked = dominantNoteAt(active);
  const contourPitch = contourPitchAt(contour, trackTime, glide);

  if (!locked) return { pitch: contourPitch, locked: null, active };
  if (Number.isNaN(contourPitch)) {
    return { pitch: locked.pitch, locked, active };
  }
  return {
    pitch: contourPitch * (1 - lock) + locked.pitch * lock,
    locked,
    active,
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
