import { describe, expect, it } from 'vitest';

import {
  type ActiveNote,
  selectActiveNotes,
  simulateSparkles,
} from '../sparkleSimulation';

describe('selectActiveNotes', () => {
  const note = { startTime: 1, endTime: 2, midiNote: 60, confidence: 1 };

  it('includes a note of an unmuted track active at the given time', () => {
    const tracks = [
      { trackId: 'a', muted: false, startTime: 0, notes: [note] },
    ];

    expect(selectActiveNotes(tracks, 1.5)).toEqual([
      { trackId: 'a', midiNote: 60, startTime: 1 },
    ]);
  });

  it('excludes notes of a muted track', () => {
    const tracks = [{ trackId: 'a', muted: true, startTime: 0, notes: [note] }];

    expect(selectActiveNotes(tracks, 1.5)).toHaveLength(0);
  });

  it('excludes notes outside the active time window', () => {
    const tracks = [
      { trackId: 'a', muted: false, startTime: 0, notes: [note] },
    ];

    expect(selectActiveNotes(tracks, 0.5)).toHaveLength(0);
    expect(selectActiveNotes(tracks, 2.5)).toHaveLength(0);
  });

  it('skips tracks with no melody yet', () => {
    const tracks = [
      { trackId: 'a', muted: false, startTime: 0, notes: undefined },
    ];

    expect(selectActiveNotes(tracks, 1)).toHaveLength(0);
  });

  it('offsets note times by the track own timeline start (an overdub recorded partway through)', () => {
    // Track starts at t=10 in the global timeline; its melody note is still
    // 0-based within the track's own buffer (startTime 1, endTime 2) — the
    // same correction Spectrogram.tsx's piano-roll overlay applies
    // (`trackPlayheadTime = playheadTime - startTime`).
    const tracks = [
      { trackId: 'a', muted: false, startTime: 10, notes: [note] },
    ];

    expect(selectActiveNotes(tracks, 1.5)).toHaveLength(0);
    expect(selectActiveNotes(tracks, 11.5)).toEqual([
      { trackId: 'a', midiNote: 60, startTime: 11 },
    ]);
  });
});

describe('simulateSparkles', () => {
  const note: ActiveNote = { trackId: 'a', midiNote: 60, startTime: 1 };
  const barCenterX = () => 100;
  const lineY = 50;

  it('is deterministic — identical inputs produce identical particle states', () => {
    const first = simulateSparkles([note], 1.1, barCenterX, lineY);
    const second = simulateSparkles([note], 1.1, barCenterX, lineY);

    expect(second).toEqual(first);
  });

  it('emits particles whose x equals the note semitone bar center', () => {
    const particles = simulateSparkles(
      [note],
      note.startTime,
      barCenterX,
      lineY,
    );

    expect(particles.length).toBeGreaterThan(0);
    for (const particle of particles) {
      expect(particle.x).toBe(100);
    }
  });

  it('expires particles after the max age', () => {
    const particles = simulateSparkles(
      [note],
      note.startTime + 10,
      barCenterX,
      lineY,
    );

    expect(particles).toHaveLength(0);
  });

  it('emits nothing before the note has started', () => {
    const particles = simulateSparkles(
      [note],
      note.startTime - 1,
      barCenterX,
      lineY,
    );

    expect(particles).toHaveLength(0);
  });

  it('positions particles using the given bar-center function per note pitch', () => {
    const highNote: ActiveNote = { trackId: 'a', midiNote: 72, startTime: 1 };
    const particles = simulateSparkles(
      [highNote],
      highNote.startTime,
      (midiNote) => (midiNote === 72 ? 250 : 0),
      lineY,
    );

    expect(particles.every((particle) => particle.x === 250)).toBe(true);
  });
});
