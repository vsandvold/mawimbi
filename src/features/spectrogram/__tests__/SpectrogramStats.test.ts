import SpectrogramStats from '../SpectrogramStats';
import { type SpectrogramData } from '../OfflineAnalyser';

const DATA: SpectrogramData = {
  frequencyFrames: [new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)],
  timeResolution: 0.025,
  frequencyBinCount: 4,
  sampleRate: 44100,
  duration: 0.075,
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

  it('measures elapsed analysis time when a start was recorded', () => {
    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementationOnce(() => 1000)
      .mockImplementationOnce(() => 1250);

    stats.recordAnalysisStart('track-1');
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA);

    expect(stats.getTrackStats('track-1')?.analysisMs).toBe(250);
    nowSpy.mockRestore();
  });

  it('preserves firstTileMs across repeat entries for the same track', () => {
    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementationOnce(() => 0) // recordAnalysisStart
      .mockImplementationOnce(() => 100) // first recordEntry
      .mockImplementationOnce(() => 100) // recordAnalysisStart (2nd)
      .mockImplementationOnce(() => 400); // second recordEntry

    stats.recordAnalysisStart('track-1');
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA);
    expect(stats.getTrackStats('track-1')?.firstTileMs).toBe(100);

    stats.recordAnalysisStart('track-1');
    stats.recordEntry('track-1', [mockTile(4, 5)], DATA);
    expect(stats.getTrackStats('track-1')?.firstTileMs).toBe(100);
    expect(stats.getTrackStats('track-1')?.analysisMs).toBe(300);
    nowSpy.mockRestore();
  });

  it('reports 0 analysisMs/firstTileMs when no start was recorded (restore path)', () => {
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA);

    const trackStats = stats.getTrackStats('track-1');
    expect(trackStats?.analysisMs).toBe(0);
    expect(trackStats?.firstTileMs).toBe(0);
    expect(trackStats?.analysisComplete).toBe(true);
  });

  it('tracks multiple tracks independently', () => {
    stats.recordEntry('track-1', [mockTile(4, 3)], DATA);
    stats.recordEntry('track-2', [mockTile(4, 3), mockTile(4, 3)], DATA);

    expect(stats.getTrackStats('track-1')?.tileCount).toBe(1);
    expect(stats.getTrackStats('track-2')?.tileCount).toBe(2);
  });
});

describe('getTrackStats', () => {
  it('returns undefined for an unknown track', () => {
    expect(stats.getTrackStats('nonexistent')).toBeUndefined();
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
