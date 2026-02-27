import { type TrackColor } from '../types/track';
import OfflineAnalyser, { SpectrogramData } from './OfflineAnalyser';
import { renderTiles } from './SpectrogramTileRenderer';

export type TrackSpectrogramEntry = {
  data: SpectrogramData;
  tiles: ImageBitmap[];
};

class SpectrogramCache {
  private entries = new Map<string, TrackSpectrogramEntry>();

  async analyse(
    trackId: string,
    audioBuffer: AudioBuffer,
    color: TrackColor,
  ): Promise<void> {
    const analyser = new OfflineAnalyser(audioBuffer);
    const data = await analyser.analyseToFrames();
    const tiles = renderTiles(data, color);
    this.entries.set(trackId, { data, tiles });
  }

  getEntry(trackId: string): TrackSpectrogramEntry | undefined {
    return this.entries.get(trackId);
  }

  invalidate(trackId: string): void {
    const entry = this.entries.get(trackId);
    if (entry) {
      entry.tiles.forEach((tile) => tile.close());
      this.entries.delete(trackId);
    }
  }

  invalidateAll(): void {
    this.entries.forEach((entry) => {
      entry.tiles.forEach((tile) => tile.close());
    });
    this.entries.clear();
  }
}

export default SpectrogramCache;
