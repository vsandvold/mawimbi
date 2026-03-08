/**
 * Melody extraction using essentia.js PredominantPitchMelodia (MELODIA).
 *
 * Runs the MELODIA algorithm on a mono audio buffer, then converts the
 * raw pitch contour into discrete note events (MelodyNote[]).
 *
 * Pipeline:
 * 1. EqualLoudness filter (perceptual pre-processing)
 * 2. PredominantPitchMelodia (pitch + confidence per frame)
 * 3. Filter unvoiced / low-confidence frames
 * 4. Quantize Hz → MIDI note number
 * 5. Group consecutive same-note frames into note events
 * 6. Discard notes shorter than minimum duration
 */

import { getEssentia } from './essentiaLoader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MelodyNote = {
  startTime: number;
  endTime: number;
  midiNote: number;
  confidence: number;
};

export type MelodyData = {
  notes: MelodyNote[];
  timeResolution: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** MELODIA default hop size in samples. */
const MELODIA_HOP_SIZE = 128;

/** Minimum confidence to accept a pitch frame. */
const CONFIDENCE_THRESHOLD = 0.25;

/** Minimum note duration in seconds (~50ms ≈ 2 MELODIA hops at 44.1 kHz). */
const MIN_NOTE_DURATION = 0.05;

/** Frequency range for melody extraction. */
const MIN_FREQUENCY = 55;
const MAX_FREQUENCY = 1760;

// ---------------------------------------------------------------------------
// Pure conversion functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Converts a frequency in Hz to the nearest MIDI note number.
 * Returns a rounded integer (0–127 clamped).
 *
 * Formula: round(12 × log2(hz / 440) + 69)
 */
export function hzToMidi(hz: number): number {
  if (hz <= 0) return 0;
  const midi = Math.round(12 * Math.log2(hz / 440) + 69);
  return Math.max(0, Math.min(127, midi));
}

/**
 * Converts a MELODIA pitch contour into discrete MelodyNote events.
 *
 * Steps:
 * 1. Filter frames where pitch = 0 (unvoiced) or confidence < threshold
 * 2. Quantize remaining Hz values to MIDI note numbers
 * 3. Group consecutive frames with the same MIDI note
 * 4. Discard notes shorter than MIN_NOTE_DURATION
 */
export function pitchContourToNotes(
  pitchValues: Float32Array,
  confidenceValues: Float32Array,
  sampleRate: number,
  hopSize: number,
): MelodyNote[] {
  const frameTime = hopSize / sampleRate;
  const frameCount = Math.min(pitchValues.length, confidenceValues.length);

  const grouped: MelodyNote[] = [];
  let currentNote: MelodyNote | null = null;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (let i = 0; i < frameCount; i++) {
    const pitch = pitchValues[i];
    const confidence = confidenceValues[i];

    if (pitch <= 0 || confidence < CONFIDENCE_THRESHOLD) {
      // Unvoiced or low-confidence frame — close current note
      if (currentNote) {
        currentNote.endTime = i * frameTime;
        currentNote.confidence = confidenceSum / confidenceCount;
        grouped.push(currentNote);
        currentNote = null;
        confidenceSum = 0;
        confidenceCount = 0;
      }
      continue;
    }

    const midi = hzToMidi(pitch);

    if (currentNote && currentNote.midiNote === midi) {
      // Same note continues — accumulate confidence
      confidenceSum += confidence;
      confidenceCount += 1;
    } else {
      // Different note — close previous and start new
      if (currentNote) {
        currentNote.endTime = i * frameTime;
        currentNote.confidence = confidenceSum / confidenceCount;
        grouped.push(currentNote);
      }
      currentNote = {
        startTime: i * frameTime,
        endTime: 0,
        midiNote: midi,
        confidence: 0,
      };
      confidenceSum = confidence;
      confidenceCount = 1;
    }
  }

  // Close final note
  if (currentNote) {
    currentNote.endTime = frameCount * frameTime;
    currentNote.confidence = confidenceSum / confidenceCount;
    grouped.push(currentNote);
  }

  // Filter notes shorter than minimum duration
  return grouped.filter(
    (note) => note.endTime - note.startTime >= MIN_NOTE_DURATION,
  );
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extracts melody from a mono audio signal using MELODIA.
 *
 * Requires essentia.js WASM to be available (loaded lazily via getEssentia).
 * Pre-processes the signal with EqualLoudness for best results.
 */
export async function extractMelody(
  monoSignal: Float32Array,
  sampleRate: number,
): Promise<MelodyData> {
  const durationSeconds = monoSignal.length / sampleRate;
  console.debug(
    `[melody] Starting extraction: ${monoSignal.length} samples, ${sampleRate} Hz, ${durationSeconds.toFixed(2)}s`,
  );

  console.debug('[melody] Loading essentia WASM...');
  const essentia = await getEssentia();
  console.debug('[melody] Essentia WASM loaded');

  const inputVector = essentia.arrayToVector(monoSignal);

  // Pre-process with EqualLoudness filter for perceptual weighting
  console.debug('[melody] Applying EqualLoudness filter...');
  const filtered = essentia.EqualLoudness(inputVector, sampleRate);
  const filteredSignal = filtered.signal;

  // Run MELODIA with recommended defaults, adjusted frequency range
  console.debug(
    `[melody] Running PredominantPitchMelodia (hopSize=${MELODIA_HOP_SIZE}, freq=${MIN_FREQUENCY}–${MAX_FREQUENCY} Hz)...`,
  );
  const result = essentia.PredominantPitchMelodia(
    filteredSignal,
    /* binResolution */ 10,
    /* filterIterations */ 3,
    /* frameSize */ 2048,
    /* guessUnvoiced */ false,
    /* harmonicWeight */ 0.8,
    /* hopSize */ MELODIA_HOP_SIZE,
    /* magnitudeCompression */ 1,
    /* magnitudeThreshold */ 40,
    /* maxFrequency */ MAX_FREQUENCY,
    /* minDuration */ 100,
    /* minFrequency */ MIN_FREQUENCY,
  );

  const pitchValues: Float32Array = essentia.vectorToArray(result.pitch);
  const confidenceValues: Float32Array = essentia.vectorToArray(
    result.pitchConfidence,
  );

  console.debug(`[melody] MELODIA returned ${pitchValues.length} pitch frames`);

  const notes = pitchContourToNotes(
    pitchValues,
    confidenceValues,
    sampleRate,
    MELODIA_HOP_SIZE,
  );

  const timeResolution = MELODIA_HOP_SIZE / sampleRate;

  console.log(
    `[melody] Extracted ${notes.length} notes from ${pitchValues.length} frames (${durationSeconds.toFixed(2)}s audio)`,
  );

  return { notes, timeResolution };
}

// Exported for testing
export {
  MELODIA_HOP_SIZE,
  CONFIDENCE_THRESHOLD,
  MIN_NOTE_DURATION,
  MIN_FREQUENCY as MELODY_MIN_FREQUENCY,
  MAX_FREQUENCY as MELODY_MAX_FREQUENCY,
};
