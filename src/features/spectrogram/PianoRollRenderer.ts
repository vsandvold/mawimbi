/**
 * Renders a piano roll overlay on a canvas, drawing detected melody notes
 * as semi-transparent rectangular blocks aligned to the CQT spectrogram's
 * log-frequency axis.
 *
 * Notes have a 3D appearance with gradient fills and distinct borders.
 * Notes currently intersecting the playhead receive a bright glow effect.
 *
 * The CQT spectrogram uses 24 bins/octave starting at C1 (32.7 Hz).
 * MIDI note numbers map to the same log scale:
 *   binIndex = 24 × log2(freq / 32.7)
 *
 * Each semitone spans 2 CQT bins (24 bins/octave ÷ 12 semitones).
 *
 * Transposed for vertical timeline: frequency maps to X axis (bin 0 on
 * the left = low frequency) and time maps to Y axis (top-to-bottom).
 */

import { type MelodyNote } from '../transcription/MelodyExtractor';
import { type TrackColor } from '../tracks/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** CQT base frequency — C1. */
const CQT_BASE_FREQUENCY = 32.7;

/** CQT bins per octave. */
const BINS_PER_OCTAVE = 24;

/** Height of a note block in CQT bins (1 semitone = 2 bins). */
const NOTE_HEIGHT_BINS = 2;

/** Note block fill opacity (0–1). */
const NOTE_FILL_OPACITY = 0.6;

/** Note block border opacity (0–1). */
const NOTE_BORDER_OPACITY = 0.85;

/** Pitch bend line opacity (0–1). */
const PITCH_BEND_OPACITY = 0.8;

/** Pitch bend line width in pixels. */
const PITCH_BEND_LINE_WIDTH = 1.5;

/** Note block corner radius in pixels. */
const CORNER_RADIUS = 2;

/** Note block border width in pixels. */
const BORDER_WIDTH = 1.5;

/** Opacity boost for notes intersecting the playhead (0–1). */
const ACTIVE_FILL_OPACITY = 0.9;

/** Glow blur radius in pixels for active notes. */
const ACTIVE_GLOW_BLUR = 8;

/** Glow opacity for active notes (0–1). */
const ACTIVE_GLOW_OPACITY = 0.5;

/** Top highlight opacity multiplier for 3D gradient (relative to fill). */
const HIGHLIGHT_LIGHTNESS_BOOST = 40;

/** Bottom shadow darkening factor (0–1, lower = darker). */
const SHADOW_DARKENING_FACTOR = 0.55;

// ---------------------------------------------------------------------------
// Coordinate mapping
// ---------------------------------------------------------------------------

/**
 * Converts a MIDI note number to a CQT bin index.
 * MIDI → frequency: freq = 440 × 2^((midi - 69) / 12)
 * Frequency → bin:   bin  = 24 × log2(freq / 32.7)
 */
export function midiNoteToBin(midiNote: number): number {
  const freq = 440 * 2 ** ((midiNote - 69) / 12);
  return BINS_PER_OCTAVE * Math.log2(freq / CQT_BASE_FREQUENCY);
}

/**
 * Whether `note` is currently sounding at `playheadTime` — shared by
 * `drawPianoRoll`'s per-note active-glow decision and `Spectrogram.tsx`'s
 * `computeActiveNotesKey` dirty-check, so the two boundary conditions can't
 * drift apart (code review, mawimbi#541).
 */
export function isNoteActiveAt(
  note: MelodyNote,
  playheadTime: number | undefined | null,
): boolean {
  if (playheadTime === undefined || playheadTime === null || playheadTime < 0) {
    return false;
  }
  return playheadTime >= note.startTime && playheadTime < note.endTime;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export type PianoRollViewport = {
  /** Pixels per second (zoom level). */
  pixelsPerSecond: number;
  /** Vertical scroll offset in content pixels (time axis). */
  contentOffset: number;
  /** Canvas / viewport height in pixels (time axis). */
  viewportHeight: number;
  /** Canvas width in pixels (frequency axis). */
  canvasWidth: number;
  /** Total number of CQT frequency bins (determines x-axis scale). */
  frequencyBinCount: number;
  /** Current playhead time in seconds (-1 or undefined = no glow effect). */
  playheadTime?: number;
};

/**
 * Draws melody notes as semi-transparent blocks onto a 2D canvas context.
 *
 * Notes have a gradient fill for a 3D appearance and a distinct border.
 * Notes intersecting the playhead receive a bright glow effect.
 *
 * Transposed for vertical timeline: time maps to Y axis (vertical culling),
 * frequency maps to X axis (MIDI note → CQT bin → canvas x-coordinate,
 * bin 0 on the left = low frequency).
 */
export function drawPianoRoll(
  ctx: CanvasRenderingContext2D,
  notes: MelodyNote[],
  color: TrackColor,
  viewport: PianoRollViewport,
): void {
  const {
    pixelsPerSecond,
    contentOffset,
    viewportHeight,
    canvasWidth,
    frequencyBinCount,
    playheadTime,
  } = viewport;

  if (notes.length === 0 || frequencyBinCount === 0) return;

  const pixelsPerBin = canvasWidth / frequencyBinCount;
  const viewStartTime = contentOffset / pixelsPerSecond;
  const viewEndTime = (contentOffset + viewportHeight) / pixelsPerSecond;

  const { r, g, b } = color;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    // Viewport culling — skip notes entirely outside the visible range
    if (note.endTime <= viewStartTime || note.startTime >= viewEndTime) {
      continue;
    }

    // Time maps to Y axis (top-to-bottom)
    const y = note.startTime * pixelsPerSecond - contentOffset;
    const height = (note.endTime - note.startTime) * pixelsPerSecond;

    // Map MIDI note to CQT bin, then to canvas x-coordinate.
    // Bin 0 is on the left (low frequency).
    const binIndex = midiNoteToBin(note.midiNote);
    const noteLeftBin = binIndex - NOTE_HEIGHT_BINS / 2;

    const x = noteLeftBin * pixelsPerBin;
    const width = NOTE_HEIGHT_BINS * pixelsPerBin;

    if (width < 1) continue;

    const isActive = isNoteActiveAt(note, playheadTime);

    drawNote(ctx, x, y, width, height, r, g, b, isActive);

    // Draw pitch bend line if the note has bend data
    if (note.pitchBends && note.pitchBends.length > 1) {
      drawPitchBendLine(ctx, y, height, pixelsPerBin, note, r, g, b, isActive);
    }
  }
}

/**
 * Draws a pitch bend line through the center of a note.
 *
 * Each pitch bend value represents a deviation in semitones from the note's
 * base pitch. The line traces these deviations along the note duration
 * (Y axis), with horizontal offsets for pitch deviation (X axis).
 */
function drawPitchBendLine(
  ctx: CanvasRenderingContext2D,
  noteY: number,
  noteHeight: number,
  pixelsPerBin: number,
  note: MelodyNote,
  r: number,
  g: number,
  b: number,
  isActive: boolean,
): void {
  const bends = note.pitchBends!;
  const bendCount = bends.length;
  const pxPerBend = noteHeight / bendCount;

  // Each semitone = 2 CQT bins; bend values are in semitones
  const baseBin = midiNoteToBin(note.midiNote);
  const baseX = baseBin * pixelsPerBin;

  const opacity = isActive ? ACTIVE_FILL_OPACITY : PITCH_BEND_OPACITY;
  ctx.save();
  ctx.strokeStyle = `rgba(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)}, ${opacity})`;
  ctx.lineWidth = PITCH_BEND_LINE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  for (let i = 0; i < bendCount; i++) {
    // Bend in semitones → horizontal offset in CQT bins (2 bins/semitone)
    const bendBins = bends[i] * NOTE_HEIGHT_BINS;
    const px = baseX + bendBins * pixelsPerBin;
    const py = noteY + i * pxPerBend;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws a single note block with gradient fill, border, and optional glow.
 */
function drawNote(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  isActive: boolean,
): void {
  const fillOpacity = isActive ? ACTIVE_FILL_OPACITY : NOTE_FILL_OPACITY;

  // Active notes: draw glow behind the note
  if (isActive) {
    ctx.save();
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${ACTIVE_GLOW_OPACITY})`;
    ctx.shadowBlur = ACTIVE_GLOW_BLUR;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fillOpacity})`;
    drawRoundedPath(ctx, x, y, width, height, CORNER_RADIUS);
    ctx.fill();
    ctx.restore();
  }

  // 3D gradient fill: lighter on the left, darker on the right
  const gradient = ctx.createLinearGradient(x, y, x + width, y);
  const rTop = Math.min(255, r + HIGHLIGHT_LIGHTNESS_BOOST);
  const gTop = Math.min(255, g + HIGHLIGHT_LIGHTNESS_BOOST);
  const bTop = Math.min(255, b + HIGHLIGHT_LIGHTNESS_BOOST);
  const rBot = (r * SHADOW_DARKENING_FACTOR) | 0;
  const gBot = (g * SHADOW_DARKENING_FACTOR) | 0;
  const bBot = (b * SHADOW_DARKENING_FACTOR) | 0;

  gradient.addColorStop(0, `rgba(${rTop}, ${gTop}, ${bTop}, ${fillOpacity})`);
  gradient.addColorStop(1, `rgba(${rBot}, ${gBot}, ${bBot}, ${fillOpacity})`);

  ctx.fillStyle = gradient;
  ctx.strokeStyle = `rgba(${(r * 0.6) | 0}, ${(g * 0.6) | 0}, ${(b * 0.6) | 0}, ${NOTE_BORDER_OPACITY})`;
  ctx.lineWidth = BORDER_WIDTH;

  drawRoundedPath(ctx, x, y, width, height, CORNER_RADIUS);
  ctx.fill();
  ctx.stroke();

  // Inner left highlight line for extra depth
  drawLeftHighlight(ctx, x, y, height, r, g, b, fillOpacity);
}

/**
 * Draws a thin highlight line along the left edge of a note for a 3D bevel.
 */
function drawLeftHighlight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  r: number,
  g: number,
  b: number,
  baseOpacity: number,
): void {
  const highlightOpacity = Math.min(1, baseOpacity * 0.5);
  ctx.strokeStyle = `rgba(${Math.min(255, r + 80)}, ${Math.min(255, g + 80)}, ${Math.min(255, b + 80)}, ${highlightOpacity})`;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + CORNER_RADIUS);
  ctx.lineTo(x + 0.5, y + height - CORNER_RADIUS);
  ctx.stroke();
}

/**
 * Creates a rounded-rectangle path without filling or stroking.
 * Uses the canvas roundRect API if available, otherwise falls back to rect.
 */
function drawRoundedPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
}
