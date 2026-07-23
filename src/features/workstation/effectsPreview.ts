// Live effects preview while dragging — spec 006 M6 (mawimbi#543), sibling
// of EffectsRefreshScheduler (effectsRefresh.ts). While a slider drag is
// live, throttled (latest-wins) ticks render a capped window of the
// track's post-effect audio and hand the resulting tile to the draw loop
// as a provisional overlay (Spectrogram.tsx). The preview never touches
// SpectrogramCache's entries or hash semantics — no setEntry, no
// saveSpectrogramData — so a provisional render can never be mistaken for,
// or persisted as, a committed result (Decision 1, the #494 bug class).

import { throttle } from 'throttle-debounce';
import { type SpectrogramResult } from '../spectrogram/SpectrogramCache';
import { spectrogramStats } from '../spectrogram/SpectrogramStats';
import { type EffectAmounts } from '../tracks/EffectsChain';
import { type TrackColor, type TrackId } from '../tracks/types';

export const PREVIEW_THROTTLE_MS = 150;
export const PREVIEW_WINDOW_MAX_SECONDS = 12;
export const PREVIEW_PREROLL_SECONDS = 2;
// Canvas-pixel height of the alpha feather applied at both edges of the
// provisional overlay (Spectrogram.tsx) — separate from the far-edge fade
// (`FAR_EDGE_FADE_PX`, Spectrogram.tsx), which only applies at a track's
// true end. Kept here so every `PREVIEW_*` tunable lives in one place
// (spec 006 M6 requirement 5).
export const PREVIEW_FEATHER_PX = 24;

export type PreviewWindowRequest = {
  /**
   * Visible window, in seconds from this track's own start. May extend
   * before 0 or past the track's duration — `computePreviewWindowPlan`
   * clips both against the track and against `PREVIEW_WINDOW_MAX_SECONDS`.
   */
  startSeconds: number;
  endSeconds: number;
};

export type PreviewWindowPlan = {
  /** Offset into the track's audio to start the offline render, including preroll. */
  renderStartSeconds: number;
  /** Duration of the offline render, including preroll. */
  renderDurationSeconds: number;
  /** Leading portion of the render that exists only to warm reverb/delay state. */
  prerollSeconds: number;
  /** Start of the region actually drawn as the overlay, after preroll is trimmed. */
  outputStartSeconds: number;
  outputDurationSeconds: number;
};

/**
 * Clips the requested visible window to the track's own bounds, caps it to
 * `PREVIEW_WINDOW_MAX_SECONDS`, and prepends up to `PREVIEW_PREROLL_SECONDS`
 * of lead-in (itself clipped so it never reaches before the track's start)
 * to warm reverb/delay state. Returns `null` when the requested window
 * doesn't intersect the track at all — nothing to preview. Pure so the
 * capping behavior is unit-testable without a scheduler instance.
 */
export function computePreviewWindowPlan(
  request: PreviewWindowRequest,
  trackDurationSeconds: number,
): PreviewWindowPlan | null {
  const outputStartSeconds = Math.max(0, request.startSeconds);
  const visibleEndSeconds = Math.min(trackDurationSeconds, request.endSeconds);
  const outputDurationSeconds = Math.min(
    PREVIEW_WINDOW_MAX_SECONDS,
    visibleEndSeconds - outputStartSeconds,
  );
  if (outputDurationSeconds <= 0) return null;

  const prerollSeconds = Math.min(PREVIEW_PREROLL_SECONDS, outputStartSeconds);
  const renderStartSeconds = outputStartSeconds - prerollSeconds;
  const renderDurationSeconds = prerollSeconds + outputDurationSeconds;

  return {
    renderStartSeconds,
    renderDurationSeconds,
    prerollSeconds,
    outputStartSeconds,
    outputDurationSeconds,
  };
}

export type PreviewOverlay = {
  tile: ImageBitmap;
  startSeconds: number;
  durationSeconds: number;
};

export type PreviewDeps = {
  renderOfflineWindow: (
    audioBuffer: AudioBuffer,
    amounts: EffectAmounts,
    plan: PreviewWindowPlan,
  ) => Promise<AudioBuffer>;
  analyseToResult: (
    audioBuffer: AudioBuffer,
    color: TrackColor,
  ) => Promise<SpectrogramResult>;
  setPreview: (trackId: TrackId, overlay: PreviewOverlay) => void;
  clearPreview: (trackId: TrackId) => void;
};

type Throttled = ((
  audioBuffer: AudioBuffer,
  color: TrackColor,
  amounts: EffectAmounts,
  request: PreviewWindowRequest,
) => void) & { cancel: (options?: { upcomingOnly?: boolean }) => void };

export class PreviewScheduler {
  private deps: PreviewDeps;
  private throttled = new Map<TrackId, Throttled>();
  private latestRequestId = new Map<TrackId, number>();
  private nextRequestId = 0;
  private disposed = false;

  constructor(deps: PreviewDeps) {
    this.deps = deps;
  }

  // Schedules a preview tick for `trackId`. Throttled (not debounced) so a
  // fast drag still previews progressively instead of only once at the
  // end — at most one render starts per `PREVIEW_THROTTLE_MS` window, using
  // the latest amounts/window seen when that window elapses.
  schedule(
    trackId: TrackId,
    audioBuffer: AudioBuffer,
    color: TrackColor,
    amounts: EffectAmounts,
    request: PreviewWindowRequest,
  ): void {
    if (this.disposed) return;
    let fn = this.throttled.get(trackId);
    if (!fn) {
      fn = throttle(
        PREVIEW_THROTTLE_MS,
        (
          buffer: AudioBuffer,
          col: TrackColor,
          amt: EffectAmounts,
          req: PreviewWindowRequest,
        ) => {
          this.run(trackId, buffer, col, amt, req);
        },
      ) as Throttled;
      this.throttled.set(trackId, fn);
    }
    fn(audioBuffer, color, amounts, request);
  }

  // Drops any pending throttled tick for `trackId`, invalidates any
  // in-flight render (its result lands but is discarded — `isStale` below),
  // and clears the overlay. Called when the commit refresh lands (its
  // full-track result supersedes the windowed preview) or when the drag
  // itself is abandoned (track cycled, drawer closed, unmount).
  clear(trackId: TrackId): void {
    this.throttled.get(trackId)?.cancel();
    this.latestRequestId.set(trackId, ++this.nextRequestId);
    this.deps.clearPreview(trackId);
  }

  dispose(): void {
    this.disposed = true;
    for (const fn of this.throttled.values()) fn.cancel();
    this.throttled.clear();
  }

  private async run(
    trackId: TrackId,
    audioBuffer: AudioBuffer,
    color: TrackColor,
    amounts: EffectAmounts,
    request: PreviewWindowRequest,
  ): Promise<void> {
    const plan = computePreviewWindowPlan(request, audioBuffer.duration);
    if (!plan) return;

    const requestId = ++this.nextRequestId;
    this.latestRequestId.set(trackId, requestId);
    if (import.meta.env.DEV) spectrogramStats.incrementPreviewRenders();

    const rendered = await this.deps.renderOfflineWindow(
      audioBuffer,
      amounts,
      plan,
    );
    if (this.isStale(trackId, requestId)) return;

    const result = await this.deps.analyseToResult(rendered, color);
    if (this.isStale(trackId, requestId)) return;

    const [tile] = result.tiles;
    if (!tile) return;

    this.deps.setPreview(trackId, {
      tile,
      startSeconds: plan.outputStartSeconds,
      durationSeconds: plan.outputDurationSeconds,
    });
  }

  private isStale(trackId: TrackId, requestId: number): boolean {
    return this.disposed || this.latestRequestId.get(trackId) !== requestId;
  }
}
