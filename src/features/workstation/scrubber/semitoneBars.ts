// --- Semitone (12-TET) bar pooling ---

/** CQT bins per semitone (24 bins/octave ÷ 12 semitones). */
const BINS_PER_SEMITONE = 2;

/**
 * Pools raw CQT bins (24 bins/octave from C1, mawimbi#220's shared bin
 * definition) into one bar per semitone: bar n is the max of bin pair
 * `[2n, 2n+1]`. Bar n's center therefore matches
 * `midiNoteToBin(midiNote) / 2` (`PianoRollRenderer.ts`), so the loudness
 * meter's bars, the piano roll, and later the sparkle milestone all agree
 * on frequency-axis x positions.
 *
 * Pools with max, never sum — summing can overflow `Uint8Array` values
 * mod 256 and corrupt the result (mawimbi#152, #195).
 */
export function poolSemitoneBars(bins: Uint8Array): Uint8Array {
  const barCount = Math.floor(bins.length / BINS_PER_SEMITONE);
  const bars = new Uint8Array(barCount);

  for (let n = 0; n < barCount; n++) {
    const a = bins[n * BINS_PER_SEMITONE];
    const b = bins[n * BINS_PER_SEMITONE + 1];
    bars[n] = Math.max(a, b);
  }

  return bars;
}
