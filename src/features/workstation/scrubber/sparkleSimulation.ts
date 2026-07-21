// --- Note-anchored sparkle simulation (spec 003 Q4) ---
//
// Returns a sparkle burst's particle states as a pure function of
// (activeNotes, engineTime) — no `Math.random`, no wall clock — so the
// determinism that plasma-playhead's particle internals lacked (#417/#418)
// holds here. Each note gets its own seeded PRNG keyed on its identity, so
// the same note always draws the same particle recipe and two calls with
// identical inputs produce identical output.

import { type MelodyNote } from '../../transcription/MelodyExtractor';

export type ActiveNote = {
  trackId: string;
  midiNote: number;
  startTime: number;
};

export type SparkleParticle = {
  x: number;
  y: number;
  age: number;
  intensity: number;
};

export type TrackMelodyInput = {
  trackId: string;
  muted: boolean;
  /** The track's own offset within the global timeline (0 for an uploaded
      track; nonzero for an overdub recorded partway through, `Track.startTime`
      in `tracks/types.ts`). `MelodyNote.startTime`/`endTime` are always
      0-based within the track's own buffer (`MelodyExtractor.ts`), so this
      converts them to engine time before comparing — the same correction
      the piano-roll melody overlay already applies
      (`Spectrogram.tsx`'s `trackPlayheadTime = playheadTime - startTime`). */
  startTime: number;
  notes: MelodyNote[] | undefined;
};

/** Particles drawn per note burst. */
const PARTICLES_PER_NOTE = 8;

/** A burst fades out this long after its note crosses the playhead line,
    regardless of how much longer the note is held — a welding flash at the
    moment of contact, not a continuous shower. */
const MAX_AGE_SECONDS = 0.35;

/** Radial spread of particles away from the note's bar center, in pixels. */
const SPREAD_PX = 16;

/**
 * Gathers notes of unmuted tracks active at `engineTime`
 * (`note.startTime ≤ engineTime ≤ note.endTime`) — the rAF loop's per-frame
 * input to `simulateSparkles`. Kept pure so "muted tracks emit nothing" is a
 * plain unit test rather than a manual on-device check.
 */
export function selectActiveNotes(
  tracks: TrackMelodyInput[],
  engineTime: number,
): ActiveNote[] {
  const active: ActiveNote[] = [];
  for (const track of tracks) {
    if (track.muted || !track.notes) continue;
    for (const note of track.notes) {
      const noteStart = note.startTime + track.startTime;
      const noteEnd = note.endTime + track.startTime;
      if (noteStart <= engineTime && engineTime <= noteEnd) {
        active.push({
          trackId: track.trackId,
          midiNote: note.midiNote,
          startTime: noteStart,
        });
      }
    }
  }
  return active;
}

/** mulberry32 — small, fast, seeded PRNG. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hashes a note's identity (track + pitch + onset) into a PRNG seed
    (FNV-1a), so the same note always draws the same particle recipe. */
function hashNoteIdentity(note: ActiveNote): number {
  const key = `${note.trackId}:${note.midiNote}:${note.startTime}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Simulates the sparkle burst for each active note as a pure function of
 * `engineTime`. `barCenterX` maps a note's MIDI pitch to the same x position
 * its semitone bar renders at (`loudnessMeterRenderer.ts`'s
 * `computeBarCenterX`), and `lineY` anchors the burst to the playhead line
 * (the meter rect's bottom edge, mawimbi#481) — keeping bars and sparkles on
 * the same frequency-axis positions (the 12-TET consistency guard,
 * kb/verification.md).
 */
export function simulateSparkles(
  activeNotes: ActiveNote[],
  engineTime: number,
  barCenterX: (midiNote: number) => number,
  lineY: number,
): SparkleParticle[] {
  const particles: SparkleParticle[] = [];

  for (const note of activeNotes) {
    const age = engineTime - note.startTime;
    if (age < 0 || age >= MAX_AGE_SECONDS) continue;

    const rng = mulberry32(hashNoteIdentity(note));
    const centerX = barCenterX(note.midiNote);
    const lifeFraction = age / MAX_AGE_SECONDS;
    const intensity = 1 - lifeFraction;

    for (let i = 0; i < PARTICLES_PER_NOTE; i++) {
      const angle = rng() * Math.PI * 2;
      const speed = 0.5 + rng() * 0.5;
      const distance = speed * lifeFraction;
      particles.push({
        x: centerX + Math.cos(angle) * SPREAD_PX * distance,
        y: lineY + Math.sin(angle) * SPREAD_PX * distance,
        age,
        intensity,
      });
    }
  }

  return particles;
}
