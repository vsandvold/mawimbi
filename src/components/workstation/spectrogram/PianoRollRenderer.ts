/**
 * Renders a piano roll overlay on a canvas, drawing detected melody notes
 * as semi-transparent rectangular blocks aligned to the CQT spectrogram's
 * log-frequency axis.
 *
 * The CQT spectrogram uses 24 bins/octave starting at C1 (32.7 Hz).
 * MIDI note numbers map to the same log scale:
 *   binIndex = 24 × log2(freq / 32.7)
 *
 * Each semitone spans 2 CQT bins (24 bins/octave ÷ 12 semitones).
 * Bin 0 is at the bottom of the canvas, matching the spectrogram orientation.
 */

import { type MelodyNote } from '../../../services/MelodyExtractor';
import { type TrackColor } from '../../../types/track';

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
const NOTE_BORDER_OPACITY = 0.8;

/** Note block corner radius in pixels. */
const CORNER_RADIUS = 2;

/** Note block border width in pixels. */
const BORDER_WIDTH = 1;

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

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export type PianoRollViewport = {
  /** Pixels per second (zoom level). */
  pixelsPerSecond: number;
  /** Horizontal scroll offset in content pixels. */
  contentOffset: number;
  /** Canvas / viewport width in pixels. */
  viewportWidth: number;
  /** Canvas height in pixels. */
  canvasHeight: number;
  /** Total number of CQT frequency bins (determines y-axis scale). */
  frequencyBinCount: number;
};

/**
 * Draws melody notes as semi-transparent blocks onto a 2D canvas context.
 *
 * Only notes within the visible viewport are rendered (horizontal culling).
 * Vertical positions are mapped from MIDI note → CQT bin → canvas pixel.
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
    viewportWidth,
    canvasHeight,
    frequencyBinCount,
  } = viewport;

  if (notes.length === 0 || frequencyBinCount === 0) return;

  const pixelsPerBin = canvasHeight / frequencyBinCount;
  const viewStartTime = contentOffset / pixelsPerSecond;
  const viewEndTime = (contentOffset + viewportWidth) / pixelsPerSecond;

  const { r, g, b } = color;
  const fillStyle = `rgba(${r}, ${g}, ${b}, ${NOTE_FILL_OPACITY})`;
  const strokeStyle = `rgba(${(r * 0.7) | 0}, ${(g * 0.7) | 0}, ${(b * 0.7) | 0}, ${NOTE_BORDER_OPACITY})`;

  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = BORDER_WIDTH;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    // Viewport culling — skip notes entirely outside the visible range
    if (note.endTime <= viewStartTime || note.startTime >= viewEndTime) {
      continue;
    }

    const x = note.startTime * pixelsPerSecond - contentOffset;
    const width = (note.endTime - note.startTime) * pixelsPerSecond;

    // Map MIDI note to CQT bin, then to canvas y-coordinate.
    // Bin 0 is at the bottom of the canvas (row = canvasHeight - 1).
    const binIndex = midiNoteToBin(note.midiNote);
    const noteTopBin = binIndex + NOTE_HEIGHT_BINS / 2;
    const noteBottomBin = binIndex - NOTE_HEIGHT_BINS / 2;

    // Canvas y: top of canvas = highest bin, bottom = bin 0
    const y = canvasHeight - noteTopBin * pixelsPerBin;
    const height = (noteTopBin - noteBottomBin) * pixelsPerBin;

    if (height < 1) continue;

    drawRoundedRect(ctx, x, y, width, height, CORNER_RADIUS);
  }
}

/**
 * Draws a filled and stroked rounded rectangle.
 * Uses the canvas roundRect API if available, otherwise falls back to
 * a simple rect (no rounded corners).
 */
function drawRoundedRect(
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
  ctx.fill();
  ctx.stroke();
}
