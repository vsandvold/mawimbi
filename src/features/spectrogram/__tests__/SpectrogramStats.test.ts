import SpectrogramStats from '../SpectrogramStats';
import { type SpectrogramData } from '../OfflineAnalyser';

const DATA: SpectrogramData = {
  frequencyFrames: [new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)],
  timeResolution: 0.025,
  frequencyBinCount: 4,
  sampleRate: 44100,
  duration: 0.075,
  totalFrames: 3,
};

function mockTile(width: number, height: number): ImageBitmap {
  return { width, height, close: () => {} } as unknown as ImageBitmap;
}

let stats: SpectrogramStats;

beforeEach(() => {
  stats = new SpectrogramStats();
});

describe('recordEntry', () => {
  it('computes tileCount/tileBytes/frameBytes and marks analysis complete', () => {
    const tiles = [mockTile(4, 3), mockTile(4, 1)];
    stats.recordEntry('track-1', tiles, DATA);

    const trackStats = stats.getTrackStats('track-1');
    expect(trackStats).toEqual({
      tileCount: 2,
      tileBytes: (4 * 3 + 4 * 1) * 4,
      frameBytes: 3 * 4,
      analysisMs: 0,
      firstTileMs: 0,
      analysisComplete: true,
    });
  });

  it('measures elapsed analysis time when a matching token is passed', () => {
    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementationOnce(() => 1000)
      .mockImplementationOnce(() => 1250);

    const token = stats.recordAnalysisStart('track-1');
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA, token);

    expect(stats.getTrackStats('track-1')?.analysisMs).toBe(250);
    nowSpy.mockRestore();
  });

  it('reports the total elapsed time on the final delivery of a chunked analysis, not 0 (review fix, mawimbi#539)', () => {
    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementationOnce(() => 0) // recordAnalysisStart
      .mockImplementationOnce(() => 100) // first (intermediate) chunk
      .mockImplementationOnce(() => 300); // final (complete) chunk

    const token = stats.recordAnalysisStart('track-1');
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA, token, false);
    expect(stats.getTrackStats('track-1')?.analysisMs).toBe(100);

    stats.recordEntry('track-1', [mockTile(4, 5)], DATA, token, true);
    expect(stats.getTrackStats('track-1')?.analysisMs).toBe(300);
    nowSpy.mockRestore();
  });

  it('reports 0 analysisMs when no token is passed, even if a start is pending', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);

    stats.recordAnalysisStart('track-1');
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA);

    expect(stats.getTrackStats('track-1')?.analysisMs).toBe(0);
    nowSpy.mockRestore();
  });

  it('reports 0 analysisMs when the passed token does not match the pending start (superseded call)', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);

    stats.recordAnalysisStart('track-1');
    const staleToken = 9999;
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA, staleToken);

    expect(stats.getTrackStats('track-1')?.analysisMs).toBe(0);
    nowSpy.mockRestore();
  });

  it("a concurrent second analyse() for the same track does not corrupt the first call's timing", () => {
    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementationOnce(() => 0) // first recordAnalysisStart
      .mockImplementationOnce(() => 50) // second recordAnalysisStart (overlapping)
      .mockImplementationOnce(() => 200) // second recordEntry resolves first
      .mockImplementationOnce(() => 300); // first recordEntry resolves second

    const firstToken = stats.recordAnalysisStart('track-1');
    const secondToken = stats.recordAnalysisStart('track-1');

    // The second (later-started) analysis lands first.
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA, secondToken);
    expect(stats.getTrackStats('track-1')?.analysisMs).toBe(150); // 200 - 50

    // The first (earlier-started) analysis lands second — its own start was
    // already consumed by nothing (it's a distinct token), so it reports 0
    // rather than being attributed the second call's elapsed time.
    stats.recordEntry('track-1', [mockTile(4, 5)], DATA, firstToken);
    expect(stats.getTrackStats('track-1')?.analysisMs).toBe(0);
    nowSpy.mockRestore();
  });

  it('preserves firstTileMs across repeat entries for the same track', () => {
    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementationOnce(() => 0) // recordAnalysisStart
      .mockImplementationOnce(() => 100) // first recordEntry
      .mockImplementationOnce(() => 100) // recordAnalysisStart (2nd)
      .mockImplementationOnce(() => 400); // second recordEntry

    const firstToken = stats.recordAnalysisStart('track-1');
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA, firstToken);
    expect(stats.getTrackStats('track-1')?.firstTileMs).toBe(100);

    const secondToken = stats.recordAnalysisStart('track-1');
    stats.recordEntry('track-1', [mockTile(4, 5)], DATA, secondToken);
    expect(stats.getTrackStats('track-1')?.firstTileMs).toBe(100);
    expect(stats.getTrackStats('track-1')?.analysisMs).toBe(300);
    nowSpy.mockRestore();
  });

  it('preserves firstTileMs across a repeat entry with no token (effects-refresh re-analysis)', () => {
    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementationOnce(() => 0) // recordAnalysisStart
      .mockImplementationOnce(() => 100); // first recordEntry

    const token = stats.recordAnalysisStart('track-1');
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA, token);
    expect(stats.getTrackStats('track-1')?.firstTileMs).toBe(100);

    // Effects-refresh calls setEntry directly, with no recordAnalysisStart
    // and no token — analysisMs reports 0, but firstTileMs is preserved.
    stats.recordEntry('track-1', [mockTile(4, 5)], DATA);
    expect(stats.getTrackStats('track-1')?.firstTileMs).toBe(100);
    expect(stats.getTrackStats('track-1')?.analysisMs).toBe(0);
    nowSpy.mockRestore();
  });

  it('reports 0 analysisMs/firstTileMs when no start was recorded (restore path)', () => {
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA);

    const trackStats = stats.getTrackStats('track-1');
    expect(trackStats?.analysisMs).toBe(0);
    expect(trackStats?.firstTileMs).toBe(0);
    expect(trackStats?.analysisComplete).toBe(true);
  });

  it('records analysisComplete as false for an intermediate chunk delivery (spec 006 M2)', () => {
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA, undefined, false);

    expect(stats.getTrackStats('track-1')?.analysisComplete).toBe(false);
  });

  it('tracks multiple tracks independently', () => {
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA);
    stats.recordEntry('track-2', [mockTile(4, 3), mockTile(4, 3)], DATA);

    expect(stats.getTrackStats('track-1')?.tileCount).toBe(1);
    expect(stats.getTrackStats('track-2')?.tileCount).toBe(2);
  });
});

describe('releaseFrames', () => {
  it('zeroes frameBytes while leaving tile/timing stats untouched', () => {
    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 100);

    const token = stats.recordAnalysisStart('track-1');
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA, token);

    stats.releaseFrames('track-1');

    const trackStats = stats.getTrackStats('track-1');
    expect(trackStats?.frameBytes).toBe(0);
    expect(trackStats?.tileCount).toBe(1);
    expect(trackStats?.tileBytes).toBe(4 * 3 * 4);
    expect(trackStats?.analysisMs).toBe(100);
    expect(trackStats?.firstTileMs).toBe(100);
    expect(trackStats?.analysisComplete).toBe(true);
    nowSpy.mockRestore();
  });

  it('does nothing when releasing an unknown track', () => {
    expect(() => stats.releaseFrames('nonexistent')).not.toThrow();
    expect(stats.getTrackStats('nonexistent')).toBeUndefined();
  });
});

describe('getTrackStats', () => {
  it('returns undefined for an unknown track', () => {
    expect(stats.getTrackStats('nonexistent')).toBeUndefined();
  });
});

describe('clearTrack', () => {
  it("removes the given track's stats", () => {
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA);
    stats.recordEntry('track-2', [mockTile(4, 3)], DATA);

    stats.clearTrack('track-1');

    expect(stats.getTrackStats('track-1')).toBeUndefined();
    expect(stats.getTrackStats('track-2')).toBeDefined();
  });

  it('drops a pending analysisStart so it cannot leak into a later track reusing the id', () => {
    const token = stats.recordAnalysisStart('track-1');
    stats.clearTrack('track-1');

    stats.recordEntry('track-1', [mockTile(4, 3)], DATA, token);

    // The pending start was cleared, so the stale token no longer matches.
    expect(stats.getTrackStats('track-1')?.analysisMs).toBe(0);
  });

  it('does nothing when clearing an unknown track', () => {
    expect(() => stats.clearTrack('nonexistent')).not.toThrow();
  });
});

describe('clearAll', () => {
  it("removes all tracks' stats", () => {
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA);
    stats.recordEntry('track-2', [mockTile(4, 3)], DATA);

    stats.clearAll();

    expect(stats.getTrackStats('track-1')).toBeUndefined();
    expect(stats.getTrackStats('track-2')).toBeUndefined();
  });

  it('does not affect global counters', () => {
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA);
    stats.incrementWindowReads();

    stats.clearAll();

    expect(stats.getCounters().windowReads).toBe(1);
  });
});

describe('counters', () => {
  it('start at zero', () => {
    expect(stats.getCounters()).toEqual({
      windowReads: 0,
      drawCalls: 0,
      mainThreadCqtConstructions: 0,
      previewRenders: 0,
    });
  });

  it('increment independently', () => {
    stats.incrementWindowReads();
    stats.incrementWindowReads();
    stats.incrementDrawCalls();
    stats.incrementMainThreadCqtConstructions();
    stats.incrementPreviewRenders();

    expect(stats.getCounters()).toEqual({
      windowReads: 2,
      drawCalls: 1,
      mainThreadCqtConstructions: 1,
      previewRenders: 1,
    });
  });

  it('getCounters returns a snapshot, not a live reference', () => {
    const snapshot = stats.getCounters();
    stats.incrementWindowReads();

    expect(snapshot.windowReads).toBe(0);
    expect(stats.getCounters().windowReads).toBe(1);
  });
});
