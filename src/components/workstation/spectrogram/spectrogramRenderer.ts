import {
  applyLogFrequencyMapping,
  createLogFrequencyMapping,
} from '../../../services/logFrequencyMapping';
import { type TrackColor } from '../../../types/track';

const LIVE_COLUMN_WIDTH = 2;

// Match the OfflineAnalyser's AnalyserNode dB range for visual consistency
const MIN_DB = -80;
const MAX_DB = -30;
const DB_RANGE = MAX_DB - MIN_DB;

// Lazily initialised log-frequency mapping cache, keyed by bin count.
let cachedBinCount = 0;
let cachedMapping: number[][] = [];
let cachedBuffer: Float32Array = new Float32Array(0);

function getLogMapping(binCount: number): {
  mapping: number[][];
  buffer: Float32Array;
} {
  if (cachedBinCount !== binCount) {
    cachedMapping = createLogFrequencyMapping(binCount);
    cachedBuffer = new Float32Array(binCount);
    cachedBinCount = binCount;
  }
  return { mapping: cachedMapping, buffer: cachedBuffer };
}

/**
 * Draws a single bright column on the canvas at the playhead position,
 * reflecting live post-effects frequency content during playback.
 *
 * Frequency data is first remapped to a logarithmic scale (matching the
 * static spectrogram tiles), then grouped into pixel rows (max intensity
 * per row) and rendered with additive compositing so the overlay appears
 * brighter than the tiles underneath.
 */
export function drawLiveColumn(
  ctx: CanvasRenderingContext2D,
  frequencyData: Float32Array,
  playheadX: number,
  height: number,
  color: TrackColor,
): void {
  if (playheadX < -LIVE_COLUMN_WIDTH || playheadX > ctx.canvas.width) return;

  const bins = frequencyData.length;
  const { mapping, buffer: logData } = getLogMapping(bins);
  applyLogFrequencyMapping(frequencyData, mapping, logData);

  const binsPerRow = bins / height;
  const { r, g, b } = color;
  const x = Math.round(playheadX);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let row = 0; row < height; row++) {
    const startBin = Math.floor(row * binsPerRow);
    const endBin = Math.floor((row + 1) * binsPerRow);
    let maxIntensity = 0;
    for (let bin = startBin; bin < endBin; bin++) {
      const intensity = dbToByte(logData[bin]);
      if (intensity > maxIntensity) maxIntensity = intensity;
    }
    if (maxIntensity === 0) continue;

    const alpha = maxIntensity / 255;
    // bin 0 → bottom row, last bin → top row
    const y = height - row - 1;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fillRect(x, y, LIVE_COLUMN_WIDTH, 1);
  }

  ctx.restore();
}

export function dbToByte(db: number): number {
  if (db <= MIN_DB) return 0;
  if (db >= MAX_DB) return 255;
  return Math.round(((db - MIN_DB) / DB_RANGE) * 255);
}
