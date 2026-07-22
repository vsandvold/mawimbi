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

class SpectrogramStats {
  private tracks = new Map<TrackId, TrackSpectrogramStats>();
  private analysisStarts = new Map<TrackId, number>();
  private counters: SpectrogramStatsCounters = {
    windowReads: 0,
    drawCalls: 0,
    mainThreadCqtConstructions: 0,
    previewRenders: 0,
  };

  // Called before an analysis (worker or main-thread) begins, so `recordEntry`
  // can compute how long it took. Absent for restores from IndexedDB and for
  // effects-refresh re-analyses, which don't go through this call — those
  // report analysisMs/firstTileMs as 0 (no fresh analysis this session).
  recordAnalysisStart(trackId: TrackId): void {
    this.analysisStarts.set(trackId, performance.now());
  }

  // Single chokepoint for all paths that land tiles in the cache (fresh
  // analysis, IndexedDB restore, effects-refresh commit) — SpectrogramCache
  // always calls this from `setEntry`.
  recordEntry(
    trackId: TrackId,
    tiles: ImageBitmap[],
    data: SpectrogramData,
  ): void {
    const start = this.analysisStarts.get(trackId);
    const elapsedMs = start !== undefined ? performance.now() - start : 0;
    this.analysisStarts.delete(trackId);

    const tileBytes = tiles.reduce(
      (sum, tile) => sum + tile.width * tile.height * BYTES_PER_TILE_PIXEL,
      0,
    );
    const frameBytes =
      data.frequencyFrames.length *
      data.frequencyBinCount *
      BYTES_PER_FRAME_BIN;
    // Preserve the first delivery's timing across repeat entries for the
    // same track (progressive analysis, spec 006 M2, will call this
    // incrementally per chunk).
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
