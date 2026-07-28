// SPIKE (mawimbi#593) — per-track derived data for the ribbon, as a plain
// memoizing class the rAF loop calls.
//
// **No React in here, on purpose.** CLAUDE.md's #114-class rule: any
// `useState` whose setter fires from an effect reachable from
// `useScrubberScroll` kills the Scrubber's signal subscriptions entirely,
// and it surfaces as unrelated-looking assertion failures (stale
// `scrollTop`, `isPlaying` stuck true) rather than as a reactivity error —
// even a bailed-out `setCached(null)` does it. `features/rhythm/
// anchorBeatTimes.ts` is the worked pattern this follows: the same
// derivation a hook would do, as a memoizing plain class, called from the
// frame loop.

import {
  type MelodyData,
  type MelodyNote,
} from '../transcription/MelodyExtractor';
import { BINS_PER_OCTAVE, MIN_FREQUENCY } from '../spectrogram/CQTAnalyser';
import { type RhythmData } from '../rhythm/RhythmAnalyser';
import { type TrackColor } from '../tracks/types';
import { rgbToOklch } from './oklch';
import { frameIndexAt, sampleEnvelope, type TrackEnvelopes } from './envelopes';
import {
  buildPitchContour,
  contourPitchAt,
  EMPTY_PITCH_CONTOUR,
  pitchAt,
  type PitchContour,
  type PitchResolution,
} from './pitchContour';
import { type RibbonInput } from './ribbonPropagation';
import { type StringParams } from './stringParams';

/** The shape React hands down each render — no signals, no services. */
export type RibbonTrackDescriptor = {
  trackId: string;
  color: TrackColor;
  /** Project-timeline offset of this track's buffer time 0. */
  startTime: number;
  duration: number;
  /** Edit mode's focus/dim semantics, reused rather than reinvented. */
  isDimmed: boolean;
};

export type RibbonTrack = {
  trackId: string;
  hue: number;
  startTime: number;
  duration: number;
  /** Per-track pitch range for `d_sep`'s relative-lane end (MIDI). */
  pitchLo: number;
  pitchHi: number;
  envelopes: TrackEnvelopes;
  notes: MelodyNote[];
  contour: PitchContour;
  input: RibbonInput;
  isDimmed: boolean;
  /** Resolves pitch, the locked note, and every active bar at a project time. */
  resolvePitch: (projectTime: number) => PitchResolution;
  /** Normalized band vector at a project time, or null outside the take. */
  bandsAt: (projectTime: number) => Uint8Array | null;
};

export type RibbonDataAccess = {
  getMelody: (trackId: string) => MelodyData | undefined;
  getRhythm: (trackId: string) => RhythmData | undefined;
  getEnvelopes: (trackId: string) => TrackEnvelopes | undefined;
};

type CacheEntry = {
  melody: MelodyData | undefined;
  rhythm: RhythmData | undefined;
  envelopes: TrackEnvelopes;
  startTime: number;
  colorKey: string;
  track: RibbonTrack;
  /** Mutable so the closures stay stable across parameter changes. */
  params: StringParams;
};

const EMPTY_ONSETS: number[] = [];

class RibbonSources {
  private cache = new Map<string, CacheEntry>();

  constructor(private access: RibbonDataAccess) {}

  /**
   * Returns one `RibbonTrack` per descriptor that has envelopes yet,
   * rebuilding a track's derived data only when one of its inputs actually
   * changed. Tracks with no envelopes are omitted — they are still being
   * extracted, and a ribbon with nothing to say is worse than no ribbon.
   */
  build(
    descriptors: readonly RibbonTrackDescriptor[],
    params: StringParams,
  ): RibbonTrack[] {
    const ribbons: RibbonTrack[] = [];
    const live = new Set<string>();

    for (const descriptor of descriptors) {
      const envelopes = this.access.getEnvelopes(descriptor.trackId);
      if (!envelopes) continue;
      live.add(descriptor.trackId);
      ribbons.push(this.resolve(descriptor, envelopes, params));
    }

    for (const trackId of this.cache.keys()) {
      if (!live.has(trackId)) this.cache.delete(trackId);
    }
    return ribbons;
  }

  private resolve(
    descriptor: RibbonTrackDescriptor,
    envelopes: TrackEnvelopes,
    params: StringParams,
  ): RibbonTrack {
    const { trackId, color, startTime } = descriptor;
    const melody = this.access.getMelody(trackId);
    const rhythm = this.access.getRhythm(trackId);
    const colorKey = `${color.r},${color.g},${color.b}`;

    const cached = this.cache.get(trackId);
    if (
      cached &&
      cached.melody === melody &&
      cached.rhythm === rhythm &&
      cached.envelopes === envelopes &&
      cached.startTime === startTime &&
      cached.colorKey === colorKey
    ) {
      // Parameters change on every slider tick; the closures read them
      // through this one mutable field so they never need rebuilding.
      cached.params = params;
      cached.track.isDimmed = descriptor.isDimmed;
      return cached.track;
    }

    const entry = this.createEntry(
      descriptor,
      envelopes,
      melody,
      rhythm,
      params,
    );
    this.cache.set(trackId, entry);
    return entry.track;
  }

  private createEntry(
    descriptor: RibbonTrackDescriptor,
    envelopes: TrackEnvelopes,
    melody: MelodyData | undefined,
    rhythm: RhythmData | undefined,
    params: StringParams,
  ): CacheEntry {
    const { trackId, color, startTime, duration } = descriptor;
    const notes = melody?.notes ?? [];
    const contour = notes.length
      ? buildPitchContour(notes, duration)
      : EMPTY_PITCH_CONTOUR;

    // Onsets are track-buffer-relative like every other analysis output
    // (`kb/domain.md`, #484), so they are offset into project time exactly
    // once, here — every consumer downstream works in project seconds.
    const onsets = (rhythm?.onsets ?? EMPTY_ONSETS).map(
      (onset) => onset + startTime,
    );

    const entry = {
      melody,
      rhythm,
      envelopes,
      startTime,
      colorKey: `${color.r},${color.g},${color.b}`,
      params,
    } as CacheEntry;

    const trackTime = (projectTime: number) => projectTime - startTime;

    const resolvePitch = (projectTime: number): PitchResolution =>
      pitchAt(
        notes,
        contour,
        trackTime(projectTime),
        entry.params.lock,
        entry.params.glide,
        entry.params.bendScale,
      );

    // Degradation when Basic Pitch returns no f0 (spec 009 Decision 1):
    // pitch drives the shimmer rate and the lightness ramp, so a track with
    // no confident note — silence, percussion, or anything Basic Pitch
    // simply failed on — falls back to the spectral centroid, which the
    // envelope pass always produces. The ribbon never freezes or flattens
    // for want of a pitch; it renders brightness instead.
    const midiAt = (projectTime: number): number => {
      const t = trackTime(projectTime);
      const resolved = resolvePitch(projectTime);
      if (!Number.isNaN(resolved.pitch)) return resolved.pitch;
      const fromContour = contourPitchAt(contour, t, entry.params.glide);
      if (!Number.isNaN(fromContour)) return fromContour;
      return centroidToMidi(sampleEnvelope(envelopes.centroid, envelopes, t));
    };

    const input: RibbonInput = {
      onsets,
      // `level`, not `rms`: the raw RMS over 225 CQT bins never approaches
      // 1, and every downstream channel assumes a 0–1 input (see
      // `toPerceptualLevel`).
      loudnessAt: (projectTime) =>
        sampleEnvelope(envelopes.level, envelopes, trackTime(projectTime)),
      flatnessAt: (projectTime) =>
        sampleEnvelope(envelopes.flatness, envelopes, trackTime(projectTime)),
      pitchAt: midiAt,
    };

    const bandsAt = (projectTime: number): Uint8Array | null => {
      const index = frameIndexAt(envelopes, trackTime(projectTime));
      if (index < 0) return null;
      const width = envelopes.bands.length / Math.max(1, envelopes.frameCount);
      return envelopes.bands.subarray(index * width, (index + 1) * width);
    };

    const [pitchLo, pitchHi] = derivePitchRange(notes);

    entry.track = {
      trackId,
      hue: rgbToOklch(color).h,
      startTime,
      duration,
      pitchLo,
      pitchHi,
      envelopes,
      notes,
      contour,
      input,
      isDimmed: descriptor.isDimmed,
      resolvePitch,
      bandsAt,
    };
    return entry;
  }
}

/** Widest a derived per-track range may be before it stops being a "lane". */
const MIN_PITCH_RANGE_SEMITONES = 12;

/** Fallback range for a track with no transcription at all. */
const DEFAULT_PITCH_RANGE: readonly [number, number] = [36, 84];

/**
 * Per-track pitch range for `d_sep`'s relative end, derived from the
 * transcription. Spec 009 open question 12 records that `Track` carries
 * nothing equivalent to the prototype's declared per-track `lo`/`hi`, and
 * that a real range would have to be derived and persisted — deriving it
 * from the notes is the spike's stand-in for that, and answering whether
 * absolute or relative should be the default is the question itself.
 */
function derivePitchRange(notes: MelodyNote[]): [number, number] {
  if (notes.length === 0) {
    return [DEFAULT_PITCH_RANGE[0], DEFAULT_PITCH_RANGE[1]];
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const note of notes) {
    if (note.midiNote < lo) lo = note.midiNote;
    if (note.midiNote > hi) hi = note.midiNote;
  }
  const centre = (lo + hi) / 2;
  const half = Math.max(MIN_PITCH_RANGE_SEMITONES / 2, (hi - lo) / 2);
  return [centre - half, centre + half];
}

/**
 * CQT bin index → MIDI, the inverse of `PianoRollRenderer.midiNoteToBin`.
 *
 * Built from `CQTAnalyser`'s own exported constants rather than a
 * re-derived frequency→pitch mapping: `kb/domain.md`'s standing rule is
 * that every analysis path shares the CQT bin definition, and four
 * misalignment bugs (#197, #218, #220, #230) came from ignoring it.
 */
export function centroidToMidi(bin: number): number {
  if (!(bin > 0)) return Number.NaN;
  // bin = BINS_PER_OCTAVE · log2(f / MIN_FREQUENCY)
  const frequency = MIN_FREQUENCY * 2 ** (bin / BINS_PER_OCTAVE);
  return 69 + 12 * Math.log2(frequency / 440);
}

export default RibbonSources;
