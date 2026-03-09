/**
 * Melody extraction using Spotify Basic Pitch — a lightweight neural network
 * for polyphonic, instrument-agnostic music transcription with pitch bend
 * detection.
 *
 * Replaces the previous essentia.js MELODIA algorithm (monophonic only).
 *
 * Pipeline:
 * 1. Resample mono audio to 22 050 Hz (Basic Pitch requirement)
 * 2. Run Basic Pitch model inference (TensorFlow.js)
 * 3. Decode frames + onsets into polyphonic note events
 * 4. Enrich notes with pitch bend data from contour output
 * 5. Convert frame-based timing to seconds
 */

import {
  BasicPitch,
  addPitchBendsToNoteEvents,
  noteFramesToTime,
  outputToNotesPoly,
} from '@spotify/basic-pitch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MelodyNote = {
  startTime: number;
  endTime: number;
  midiNote: number;
  confidence: number;
  /** Per-frame pitch bend values in semitones (undefined if no bend). */
  pitchBends?: number[];
};

export type MelodyData = {
  notes: MelodyNote[];
  timeResolution: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Basic Pitch model sample rate — audio must be resampled to this rate. */
const MODEL_SAMPLE_RATE = 22050;

/** Basic Pitch FFT hop size (from model constants). */
const FFT_HOP = 256;

/** Time resolution of the model output in seconds. */
const TIME_RESOLUTION = FFT_HOP / MODEL_SAMPLE_RATE;

/** Minimum onset activation threshold for note detection. */
const ONSET_THRESHOLD = 0.5;

/** Minimum frame activation threshold for note continuation. */
const FRAME_THRESHOLD = 0.3;

/**
 * Minimum note length in model frames. At ~11.6 ms/frame, 5 frames ≈ 58 ms.
 * Comparable to the previous MELODIA MIN_NOTE_DURATION of 50 ms.
 */
const MIN_NOTE_LENGTH_FRAMES = 5;

/** Frequency range for melody extraction. */
const MIN_FREQUENCY = 55;
const MAX_FREQUENCY = 1760;

// ---------------------------------------------------------------------------
// Resampling
// ---------------------------------------------------------------------------

/**
 * Resamples a mono Float32Array from `sourceSampleRate` to `targetSampleRate`
 * using linear interpolation. Sufficient quality for neural network inference
 * where the model's own windowing dominates the frequency resolution.
 */
export function resampleLinear(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate === targetSampleRate) return input;

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.ceil(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const lo = Math.floor(srcIndex);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = srcIndex - lo;
    output[i] = input[lo] * (1 - frac) + input[hi] * frac;
  }

  return output;
}

// ---------------------------------------------------------------------------
// Model management
// ---------------------------------------------------------------------------

let basicPitchInstance: BasicPitch | null = null;

/**
 * Returns a lazily created BasicPitch instance. The TF.js model is loaded
 * on first use and cached for subsequent calls.
 *
 * The model path points to the TF.js model assets copied to the public
 * directory during project setup.
 */
function getBasicPitch(): BasicPitch {
  if (!basicPitchInstance) {
    const modelUrl = '/basic-pitch-model/model.json';
    basicPitchInstance = new BasicPitch(modelUrl);
  }
  return basicPitchInstance;
}

/**
 * Pre-loads the Basic Pitch TF.js model so it is ready when melody
 * extraction is first requested. Non-blocking — failures are logged
 * but do not prevent other features from working.
 */
export async function preWarmBasicPitch(): Promise<void> {
  try {
    const bp = getBasicPitch();
    await bp.model;
    console.debug('[melody] Basic Pitch model pre-warmed');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[melody] Basic Pitch pre-warm failed: ${detail}`);
  }
}

/** Resets the cached instance. Intended for testing only. */
export function resetBasicPitch(): void {
  basicPitchInstance = null;
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extracts melody from a mono audio signal using Spotify Basic Pitch.
 *
 * Basic Pitch is a polyphonic, instrument-agnostic neural network that
 * detects multiple simultaneous notes with pitch bend information.
 * The input is automatically resampled to 22 050 Hz as required by the model.
 */
export async function extractMelody(
  monoSignal: Float32Array,
  sampleRate: number,
): Promise<MelodyData> {
  const durationSeconds = monoSignal.length / sampleRate;
  console.debug(
    `[melody] Starting Basic Pitch extraction: ${monoSignal.length} samples, ${sampleRate} Hz, ${durationSeconds.toFixed(2)}s`,
  );

  // Resample to 22 050 Hz if needed
  const resampled = resampleLinear(monoSignal, sampleRate, MODEL_SAMPLE_RATE);
  console.debug(
    `[melody] Resampled ${monoSignal.length} → ${resampled.length} samples (${sampleRate} → ${MODEL_SAMPLE_RATE} Hz)`,
  );

  // Run Basic Pitch inference
  const bp = getBasicPitch();

  const allFrames: number[][] = [];
  const allOnsets: number[][] = [];
  const allContours: number[][] = [];

  await bp.evaluateModel(
    resampled,
    (frames, onsets, contours) => {
      allFrames.push(...frames);
      allOnsets.push(...onsets);
      allContours.push(...contours);
    },
    (percent) => {
      if (percent === 0 || percent === 1 || percent % 0.25 < 0.01) {
        console.debug(
          `[melody] Basic Pitch progress: ${(percent * 100).toFixed(0)}%`,
        );
      }
    },
  );

  console.debug(
    `[melody] Basic Pitch inference complete: ${allFrames.length} frames`,
  );

  // Decode model output into note events
  const noteEvents = outputToNotesPoly(
    allFrames,
    allOnsets,
    ONSET_THRESHOLD,
    FRAME_THRESHOLD,
    MIN_NOTE_LENGTH_FRAMES,
    /* inferOnsets */ true,
    MAX_FREQUENCY,
    MIN_FREQUENCY,
  );

  // Enrich notes with pitch bend data from contour output
  const withBends = addPitchBendsToNoteEvents(allContours, noteEvents);

  // Convert frame-based timing to seconds
  const noteTimes = noteFramesToTime(withBends);

  // Map to MelodyNote format
  const notes: MelodyNote[] = noteTimes.map((n) => {
    const note: MelodyNote = {
      startTime: n.startTimeSeconds,
      endTime: n.startTimeSeconds + n.durationSeconds,
      midiNote: n.pitchMidi,
      confidence: n.amplitude,
    };
    if (n.pitchBends && n.pitchBends.length > 0) {
      note.pitchBends = n.pitchBends;
    }
    return note;
  });

  console.log(
    `[melody] Extracted ${notes.length} notes from ${allFrames.length} frames (${durationSeconds.toFixed(2)}s audio)`,
  );

  return { notes, timeResolution: TIME_RESOLUTION };
}

// Exported for testing
export {
  MODEL_SAMPLE_RATE,
  ONSET_THRESHOLD,
  FRAME_THRESHOLD,
  MIN_NOTE_LENGTH_FRAMES,
  MIN_FREQUENCY as MELODY_MIN_FREQUENCY,
  MAX_FREQUENCY as MELODY_MAX_FREQUENCY,
  TIME_RESOLUTION,
};
