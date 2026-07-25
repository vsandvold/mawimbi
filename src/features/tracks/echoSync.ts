// Tempo-synced Echo — the single source of the track's delay time (spec 007
// Goal 5, #560).
//
// The live chain (`EffectsChain`), the offline tile render
// (`renderTrackOffline`), the live preview window, and the persisted params
// hash all resolve their delay time through `selectEchoDelaySeconds` here,
// so "what the user hears" and "what the spectrogram shows" cannot drift
// apart by duplicating the arithmetic.
//
// What a track *stores* is the subdivision, not a delay time: the seconds
// are derived from whatever tempo estimate the track currently has. A
// re-estimate (an effects refresh, a re-record) therefore moves the echo
// with the BPM the drawer displays, rather than leaving a committed delay
// silently disagreeing with the badge above it (spec 007 open question 3 —
// the issue's "computed at commit time" v1 would have allowed exactly that
// disagreement; #560's coordination comment flagged it).

import { selectConfidentTempo, type TrackTempo } from '../rhythm/tempo';

/**
 * The four musically useful delay subdivisions (spec Goal 5). Ordered
 * longest to shortest — the order the segmented control renders them in.
 */
export const ECHO_SUBDIVISIONS = [
  'quarter',
  'dottedEighth',
  'eighth',
  'eighthTriplet',
] as const;

export type EchoSubdivision = (typeof ECHO_SUBDIVISIONS)[number];

/** Beats per subdivision — a beat being a quarter note, as BPM counts them. */
const SUBDIVISION_BEATS: Record<EchoSubdivision, number> = {
  quarter: 1,
  dottedEighth: 0.75,
  eighth: 0.5,
  eighthTriplet: 1 / 3,
};

const SECONDS_PER_MINUTE = 60;

/**
 * A resolved sync: a subdivision *and* the tempo it is measured against.
 * Only ever constructed by `resolveEchoSync`, which refuses to build one
 * from an estimate the product doesn't trust.
 */
export type EchoSync = {
  subdivision: EchoSubdivision;
  bpm: number;
};

/**
 * Delay time with no sync — spec 004's fixed constant, and still what an
 * untempo'd track uses (spec Goal 5: no confident tempo degrades to today's
 * behaviour, never to a wrong-feeling sync).
 */
export const ECHO_DELAY_SECONDS = 0.25;

/**
 * Ceiling for a synced delay time, and the `maxDelay` every `FeedbackDelay`
 * this app builds is constructed with.
 *
 * Not cosmetic: `Tone.FeedbackDelay`'s own `maxDelay` default is 1 second,
 * and the underlying native `DelayNode` silently *clamps* `delayTime` to it
 * rather than erroring — so a quarter note below 60 BPM (essentia estimates
 * down to 40 BPM, i.e. 1.5 s) would have played back at the wrong time with
 * nothing reporting a problem. 2 s covers a quarter note at 30 BPM, below
 * anything the estimator produces.
 */
export const ECHO_MAX_DELAY_SECONDS = 2;

/**
 * Pairs a track's committed subdivision with its current tempo estimate,
 * or `null` when either is missing.
 *
 * Gates on `selectConfidentTempo` — the same call the drawer's BPM badge
 * uses — rather than a second confidence comparison, so the badge and the
 * echo can never disagree about whether this track has a tempo
 * (`kb/decisions.md` 2026-07-25, one product-wide threshold).
 */
export function resolveEchoSync(
  subdivision: EchoSubdivision | undefined,
  tempo: TrackTempo | undefined,
): EchoSync | null {
  if (!subdivision) return null;
  const confident = selectConfidentTempo(tempo);
  if (!confident) return null;
  return { subdivision, bpm: confident.bpm };
}

/**
 * The delay time in seconds for a resolved sync — `subdivision × 60/BPM` —
 * or the fixed default when there is no sync to follow.
 */
export function selectEchoDelaySeconds(
  sync: EchoSync | null | undefined,
): number {
  if (!sync) return ECHO_DELAY_SECONDS;
  const seconds =
    SUBDIVISION_BEATS[sync.subdivision] * (SECONDS_PER_MINUTE / sync.bpm);
  if (!Number.isFinite(seconds) || seconds <= 0) return ECHO_DELAY_SECONDS;
  return Math.min(seconds, ECHO_MAX_DELAY_SECONDS);
}
