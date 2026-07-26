// BeatPulse — the arrival envelope (spec 008 Decision 4, milestone 5).
//
// The moment of arrival: the loudness meter's frame flares as each point of
// the anchor's *induced* grid crosses the playhead line. The induced grid is
// what a listener taps (`induceBeatGrid.ts`), so it is what the frame
// pulses — not every transient, and not the raw detected ticks.
//
// Data-driven, never live-analysed: the grid comes from persisted ticks and
// the clock is `playback.getEngineTime()` (`transportTime` is not a clock —
// CLAUDE.md). That supersedes #485's live spectral-flux mechanism for
// playback, for a verification reason as much as a timing one — this sandbox
// never delivers live worklet frames (kb/verification.md, #542), so a
// flux-driven envelope's rendering could not be falsified end to end here,
// while this one is a pure function of (grid, engine time, prior state).
//
// Ballistics family: `BarSmoother` (`barTransfer.ts`) — instant attack, then
// a decay applied against elapsed *engine* time rather than per frame, so a
// dropped or stalled frame can't stretch the flare. This sandbox's rAF loop
// runs in uneven 20–90 ms steps under load (kb/verification.md, #484), and a
// per-frame coefficient would make the envelope's shape a function of how
// busy the machine is.

/**
 * Time constant of the exponential decay: the envelope falls to 1/e after
 * this long, and below `MIN_VISIBLE_PULSE` after ~2.3× it. Sized against the
 * shortest interval the pulse has to stay legible in — at 120 BPM the flare
 * is gone well before the next beat arrives, so consecutive beats read as
 * separate arrivals rather than one sustained glow. Human QA owns the final
 * number (spec open question 4).
 */
export const PULSE_DECAY_TIME_CONSTANT_SECONDS = 0.12;

/**
 * Envelope level below which the frame renders exactly as it does with no
 * pulse at all. An exponential never reaches zero, and without a floor the
 * meter would carry a permanent sub-perceptual halo between beats — which
 * also makes "is the pulse on right now" unfalsifiable, since every pixel
 * would be very slightly lit forever (`e2e/rhythm-pulse.spec.ts` reads that
 * distinction directly).
 */
export const MIN_VISIBLE_PULSE = 0.15;

/**
 * The arrival envelope's state. Pure: `update` is a function of the grid,
 * the engine time, and the prior state — no wall clock, no `Math.random`,
 * so a transition trace is reproducible (the determinism the plasma
 * playhead's particle internals lacked, kb/decisions.md 2026-03-15).
 */
export class BeatPulse {
  private envelope = 0;
  private previousEngineTime: number | null = null;

  /** The current envelope, 0–1. */
  get level(): number {
    return this.envelope;
  }

  /**
   * Drops the envelope *and* the phase. Called from
   * `renderLoudnessMeterIdle`, which runs on every playback discontinuity
   * (pause, stop, seek) — the #483 lesson: without it, resuming replays the
   * stale pre-pause decay, and every grid point between the old and new
   * positions would count as crossed on the first frame back.
   */
  reset(): void {
    this.envelope = 0;
    this.previousEngineTime = null;
  }

  /**
   * Advances the envelope to `engineTime` and returns its new level.
   *
   * `gridTimes` are project-time grid points (the caller has already applied
   * the anchor's `startTime` — the #484 class, kb/domain.md). A crossing is
   * a grid point in `(previous frame's time, engineTime]`; the level is then
   * a pure function of how long ago the *latest* such point was, so a frame
   * that straddles several beats produces one attack aged from the last of
   * them rather than an attack per beat the viewer never saw.
   */
  update(gridTimes: number[], engineTime: number): number {
    if (!Number.isFinite(engineTime)) return this.envelope;

    const previous = this.previousEngineTime;
    this.previousEngineTime = engineTime;

    // The first frame after a reset only establishes the phase: there is no
    // interval behind it to have crossed anything in, and treating the whole
    // take as crossed would flare on every resume.
    //
    // A backwards jump is the same situation — a discontinuity that didn't
    // route through the idle frame (a rewind landing between two frames of a
    // still-running loop) — and gets the same treatment rather than
    // "crossing" every grid point back to the new position.
    if (previous === null || engineTime < previous) {
      this.envelope = 0;
      return this.envelope;
    }

    const crossing = latestCrossing(gridTimes, previous, engineTime);
    const from = crossing === null ? this.envelope : 1;
    const elapsed = engineTime - (crossing ?? previous);
    this.envelope =
      from * Math.exp(-elapsed / PULSE_DECAY_TIME_CONSTANT_SECONDS);
    return this.envelope;
  }
}

/**
 * The last grid point in `(after, upTo]`, or `null` if the frame crossed
 * none.
 *
 * A plain scan rather than a binary search: the comparisons are all false
 * for a non-finite entry, so a corrupt persisted tick is skipped instead of
 * derailing a search that assumes an ordered array — and unlike the sort the
 * rung renderer had to shed (`/code-review` on PR #585), a scan allocates
 * nothing, which is the property that matters on this loop (mawimbi#541).
 */
function latestCrossing(
  gridTimes: number[],
  after: number,
  upTo: number,
): number | null {
  let latest: number | null = null;
  for (const time of gridTimes) {
    if (time > after && time <= upTo && (latest === null || time > latest)) {
      latest = time;
    }
  }
  return latest;
}
