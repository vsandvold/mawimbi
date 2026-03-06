// audioSegment — extracts the loudest segment from audio samples.
//
// CLAP's audio encoder processes a fixed-length window (~7 s at 48 kHz).
// When the full audio is passed, the pipeline truncates from the start —
// which is often silence or a quiet intro for stems. This module finds
// the segment with the highest energy and returns it so the classifier
// receives representative audio content.

// Duration of the segment to extract (seconds). Slightly longer than
// CLAP's window to ensure the encoder has enough content even after
// internal padding/truncation.
const SEGMENT_DURATION_S = 10;

// Window size for the sliding RMS calculation (seconds). A 1-second
// hop keeps the search fast while being granular enough to locate the
// loudest region.
const HOP_DURATION_S = 1;

/**
 * Extracts the loudest segment of `SEGMENT_DURATION_S` seconds from
 * mono audio samples. If the audio is shorter than the segment duration,
 * the original samples are returned unchanged.
 *
 * Uses a sliding window with a 1-second hop to find the segment with
 * the maximum RMS energy.
 */
export function extractLoudestSegment(
  samples: Float32Array,
  sampleRate: number,
): Float32Array {
  const segmentLength = Math.round(SEGMENT_DURATION_S * sampleRate);

  if (samples.length <= segmentLength) {
    return samples;
  }

  const hopLength = Math.round(HOP_DURATION_S * sampleRate);
  let bestOffset = 0;
  let bestEnergy = -1;

  for (
    let offset = 0;
    offset + segmentLength <= samples.length;
    offset += hopLength
  ) {
    let energy = 0;
    for (let i = offset; i < offset + segmentLength; i++) {
      energy += samples[i] * samples[i];
    }
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestOffset = offset;
    }
  }

  return samples.subarray(bestOffset, bestOffset + segmentLength);
}
