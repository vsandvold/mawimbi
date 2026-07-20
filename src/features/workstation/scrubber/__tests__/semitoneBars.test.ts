import { describe, expect, it } from 'vitest';

import { midiNoteToBin } from '../../../spectrogram/PianoRollRenderer';
import { poolSemitoneBars } from '../semitoneBars';

describe('poolSemitoneBars', () => {
  it('lights the bar matching a synthetic pure tone, at the piano roll bin/2 position', () => {
    const midiNote = 60; // C4
    const rawBin = Math.round(midiNoteToBin(midiNote));
    const bins = new Uint8Array(200);
    bins[rawBin] = 255;

    const bars = poolSemitoneBars(bins);
    const expectedBar = Math.round(midiNoteToBin(midiNote) / 2);

    expect(Math.abs(bars.indexOf(255) - expectedBar)).toBeLessThanOrEqual(1);
  });

  it('keeps semitone spacing uniform across the register', () => {
    const notes = [24, 36, 48, 60, 72, 84]; // C1..C7, one octave apart
    const bars = notes.map((midi) => Math.round(midiNoteToBin(midi) / 2));

    const diffs = bars.slice(1).map((bar, i) => bar - bars[i]);
    const mean = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
    const variance =
      diffs.reduce((sum, d) => sum + (d - mean) ** 2, 0) / diffs.length;
    const coefficientOfVariation = Math.sqrt(variance) / mean;

    expect(coefficientOfVariation).toBeLessThan(0.15);
  });

  it('max-pools a bin pair — a single hot bin dominates', () => {
    const bins = new Uint8Array([10, 250, 5, 5]);

    const bars = poolSemitoneBars(bins);

    expect(bars[0]).toBe(250);
    expect(bars[1]).toBe(5);
  });

  it('pools with max, never sum — no mod-256 overflow', () => {
    const bins = new Uint8Array([200, 200]);

    const bars = poolSemitoneBars(bins);

    expect(bars[0]).toBe(200);
  });

  it('drops a trailing unpaired bin', () => {
    const bins = new Uint8Array([1, 2, 3]);

    const bars = poolSemitoneBars(bins);

    expect(bars.length).toBe(1);
  });

  it('returns an empty array for empty input', () => {
    expect(poolSemitoneBars(new Uint8Array(0))).toHaveLength(0);
  });
});
