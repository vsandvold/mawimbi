// anchorBeatTimes — the rhythm anchor's induced grid, in project time, for
// the one consumer that reads it every frame (spec 008 Decision 4).
//
// `useRhythmAnchor` answers the same question for the *rendering* path, and
// does it with React state — right there, where a new grid must re-render
// the overlay. The arrival pulse can't use it: it is consumed inside
// `useScrubberScroll`'s rAF loop, and React state in the Scrubber's own
// render path silently kills the signal subscriptions the whole scrubber
// runs on (the #114 class — measured while building this: a single
// `setState` from a mount effect there left `playbackState` changes no
// longer re-rendering, so scroll-sync and scrub-to-pause both stopped
// working, with the unit suite reporting it as two unrelated failures).
//
// So this is the same derivation with no React in it: a memo keyed on the
// identities of the two inputs that can change it. Every frame that changes
// neither — which is every frame — costs two reference comparisons and a
// map lookup, no allocation, on the loop mawimbi#541 exists to keep
// allocation-free.

import { type Track, type TrackId } from '../tracks/types';
import { induceBeatGrid } from './induceBeatGrid';
import { selectRhythmAnchor } from './selectRhythmAnchor';

/** Reads a track's detected beat ticks, or `undefined` if it has none yet. */
export type TicksReader = (trackId: TrackId) => number[] | undefined;

/** The empty grid, as one shared identity — see `resolve`. */
const NO_BEAT_TIMES: number[] = [];

export class AnchorBeatTimes {
  private tracks: Track[] | null = null;
  private anchorTrackId: TrackId | null = null;
  private anchorStartTime = 0;

  private ticks: number[] | undefined = undefined;
  private beatTimes: number[] = NO_BEAT_TIMES;

  /**
   * The current anchor's induced grid points as project times — the
   * anchor's own `startTime` already added, since the ticks are
   * track-buffer relative like every other analysis output (kb/domain.md,
   * the #484 class) and `BeatPulse` compares them against engine time.
   *
   * `[]` whenever there is no confident anchor or its analysis hasn't
   * landed, which renders as no pulse at all (spec Goal 2's honest
   * degradation). The returned array's identity is stable until the grid
   * genuinely changes, so a caller may use it as a dirty check.
   */
  resolve(tracks: Track[], readTicks: TicksReader): number[] {
    if (tracks !== this.tracks) {
      this.tracks = tracks;
      this.anchorTrackId = selectRhythmAnchor(tracks);
      this.anchorStartTime =
        tracks.find((track) => track.trackId === this.anchorTrackId)
          ?.startTime ?? 0;
    }

    const ticks =
      this.anchorTrackId === null ? undefined : readTicks(this.anchorTrackId);
    if (ticks === this.ticks) return this.beatTimes;

    this.ticks = ticks;
    this.beatTimes = ticks
      ? induceBeatGrid(ticks).map((time) => time + this.anchorStartTime)
      : NO_BEAT_TIMES;
    return this.beatTimes;
  }
}
