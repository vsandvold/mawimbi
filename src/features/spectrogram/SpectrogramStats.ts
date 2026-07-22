// Spectrogram DEV bridge (mawimbi#538, spec 006 milestone 1) — the
// measurement harness later milestones' verification depends on. Counters
// are incremented at their source (SpectrogramCache, Spectrogram.tsx,
// FrequencyVisualizer.ts) guarded by `import.meta.env.DEV`, so this module
// never runs in production builds. Exposed read-only via
// `window.__mawimbi.spectrogramStats` (AudioService.ts, global.d.ts).

import { type TrackId } from '../tracks/types';
import { type SpectrogramData } from './OfflineAnalyser';

const BYTES_PER_TILE_PIXEL = 4;
const BYTES_PER_FRAME_BIN = 1;

export type TrackSpectrogramStats = {
  tileCount: number;
  tileBytes: number;
  frameBytes: number;
  analysisMs: number;
  firstTileMs: number;
  analysisComplete: boolean;
};

export type SpectrogramStatsCounters = {
  windowReads: number;
  drawCalls: number;
  mainThreadCqtConstructions: number;
  previewRenders: number;
};

type PendingAnalysis = {
  startTime: number;
  token: number;
};

class SpectrogramStats {
  private tracks = new Map<TrackId, TrackSpectrogramStats>();
  private analysisStarts = new Map<TrackId, PendingAnalysis>();
  private nextAnalysisToken = 0;
  private counters: SpectrogramStatsCounters = {
    windowReads: 0,
    drawCalls: 0,
    mainThreadCqtConstructions: 0,
    previewRenders: 0,
  };

  // Called before an analysis (worker or main-thread) begins. Returns a
  // token the caller must pass to the matching `recordEntry` call — a
  // second `analyse()` for the same track can start before the first one's
  // `recordEntry` runs (`useSpectrogramCache.ts`'s effects-commit-mid-flight
  // re-entry), and without the token neither call's timing could be
  // distinguished from the other's in this shared, trackId-keyed map.
  // Restores from IndexedDB and effects-refresh re-analyses skip this call
  // and pass no token to `recordEntry`, so they report analysisMs as 0 (no
  // fresh analysis timing available) without touching any concurrently
  // in-flight start.
  recordAnalysisStart(trackId: TrackId): number {
    const token = this.nextAnalysisToken++;
    this.analysisStarts.set(trackId, { startTime: performance.now(), token });
    return token;
  }

  // Single chokepoint for all paths that land tiles in the cache (fresh
  // analysis, IndexedDB restore, effects-refresh commit) — SpectrogramCache
  // always calls this from `setEntry`. `token` must match the pending
  // `recordAnalysisStart` entry to consume it and compute a real
  // `analysisMs`; a missing or stale (superseded by a newer analysis for
  // the same track) token reports elapsedMs as 0 and leaves the map alone.
  recordEntry(
    trackId: TrackId,
    tiles: ImageBitmap[],
    data: SpectrogramData,
    token?: number,
  ): void {
    const pending = this.analysisStarts.get(trackId);
    let elapsedMs = 0;
    if (token !== undefined && pending?.token === token) {
      elapsedMs = performance.now() - pending.startTime;
      this.analysisStarts.delete(trackId);
    }

    const tileBytes = tiles.reduce(
      (sum, tile) => sum + tile.width * tile.height * BYTES_PER_TILE_PIXEL,
      0,
    );
    const frameBytes =
      data.frequencyFrames.length *
      data.frequencyBinCount *
      BYTES_PER_FRAME_BIN;
    // Preserve the first delivery's timing across repeat entries for the
    // same track — already load-bearing today (an effects-refresh commit's
    // re-analysis calls this with no token, so it keeps the original dry
    // analysis's firstTileMs instead of resetting to 0), and will also
    // serve spec 006 M2's chunked/incremental deliveries once that lands.
    const firstTileMs = this.tracks.get(trackId)?.firstTileMs ?? elapsedMs;

    this.tracks.set(trackId, {
      tileCount: tiles.length,
      tileBytes,
      frameBytes,
      analysisMs: elapsedMs,
      firstTileMs,
      analysisComplete: true,
    });
  }

  // Drops a track's stats when its cache entry is invalidated
  // (`SpectrogramCache.invalidate`), so this bridge's per-track accounting
  // doesn't grow unboundedly across track deletions in a long session.
  clearTrack(trackId: TrackId): void {
    this.tracks.delete(trackId);
    this.analysisStarts.delete(trackId);
  }

  // Drops all tracks' stats (`SpectrogramCache.invalidateAll`).
  clearAll(): void {
    this.tracks.clear();
    this.analysisStarts.clear();
  }

  incrementWindowReads(): void {
    this.counters.windowReads++;
  }

  incrementDrawCalls(): void {
    this.counters.drawCalls++;
  }

  incrementMainThreadCqtConstructions(): void {
    this.counters.mainThreadCqtConstructions++;
  }

  incrementPreviewRenders(): void {
    this.counters.previewRenders++;
  }

  getTrackStats(trackId: TrackId): TrackSpectrogramStats | undefined {
    return this.tracks.get(trackId);
  }

  getCounters(): SpectrogramStatsCounters {
    return { ...this.counters };
  }
}

// One shared instance — reachable from SpectrogramCache, Spectrogram.tsx,
// and FrequencyVisualizer.ts without threading a service reference through
// every draw function's parameters.
export const spectrogramStats = new SpectrogramStats();

export default SpectrogramStats;
