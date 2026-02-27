import { useEffect, useRef, useState } from 'react';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import { useAudioService } from '../../hooks/useAudioService';
import { useTrackVolume } from '../../hooks/useTrackVolume';
import { TrackSpectrogramEntry } from '../../services/SpectrogramCache';
import { isPlaying, transportTime } from '../../signals/transportSignals';
import { Track, TrackColor } from '../project/projectPageReducer';
import './Spectrogram.css';

type SpectrogramProps = {
  height: number;
  pixelsPerSecond: number;
  track: Track;
};

const TILE_WIDTH = 4096;
const SCROLL_CONTAINER_CLASS = '.scrubber__timeline';
const LIVE_COLUMN_WIDTH = 2;

// Match the OfflineAnalyser's AnalyserNode dB range for visual consistency
const MIN_DB = -80;
const MAX_DB = -30;
const DB_RANGE = MAX_DB - MIN_DB;

const Spectrogram = ({ height, pixelsPerSecond, track }: SpectrogramProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastDrawnRef = useRef({ offset: -1, pps: -1, tileCount: -1 });

  const { trackId, color } = track;

  const audioService = useAudioService();
  const audioBuffer = audioService.retrieveAudioBuffer(trackId);

  const [entry, setEntry] = useState<TrackSpectrogramEntry | undefined>();

  // Trigger cache analysis on mount if not already cached
  useEffect(() => {
    if (!audioBuffer) return;

    const cached = audioService.spectrogramCache.getEntry(trackId);
    if (cached) {
      setEntry(cached);
      return;
    }

    let cancelled = false;
    audioService.spectrogramCache
      .analyse(trackId, audioBuffer, color)
      .then(() => {
        if (!cancelled) {
          setEntry(audioService.spectrogramCache.getEntry(trackId));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, audioBuffer, color, audioService]);

  const duration = audioBuffer?.duration ?? 0;
  const containerWidth = duration * pixelsPerSecond;

  const timeResolution = entry?.data.timeResolution ?? 0.025;
  const frameDisplayWidth = pixelsPerSecond * timeResolution;
  const tileDisplayWidth = TILE_WIDTH * frameDisplayWidth;
  const totalFrames = entry?.data.frequencyFrames.length ?? 0;
  const tiles = entry?.tiles ?? [];

  // Draw visible tiles on each animation frame
  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || tiles.length === 0) return;

    const scrollParent = container.closest(SCROLL_CONTAINER_CLASS);
    const viewportWidth = scrollParent?.clientWidth ?? window.innerWidth;

    // Derive content offset from the scroll parent's scrollLeft property
    // rather than getBoundingClientRect(). This avoids browser differences
    // in how position:sticky elements report their rect (desktop vs. mobile
    // compositors) and is cheaper than triggering layout queries each frame.
    const scrollLeft = scrollParent?.scrollLeft ?? 0;
    const timeline = container.closest('.timeline');
    const paddingLeft = timeline
      ? parseFloat(getComputedStyle(timeline).paddingLeft) || 0
      : 0;
    const maxContentOffset = Math.max(0, containerWidth - viewportWidth);
    const contentOffset = Math.min(
      Math.max(0, scrollLeft - paddingLeft),
      maxContentOffset,
    );

    const playing = isPlaying.value;

    const needsResize =
      canvas.width !== viewportWidth || canvas.height !== height;

    const last = lastDrawnRef.current;
    // Always redraw during playback so the live overlay tracks the playhead
    if (
      !needsResize &&
      !playing &&
      contentOffset === last.offset &&
      pixelsPerSecond === last.pps &&
      tiles.length === last.tileCount
    ) {
      return;
    }
    last.offset = contentOffset;
    last.pps = pixelsPerSecond;
    last.tileCount = tiles.length;

    if (needsResize) {
      canvas.width = viewportWidth;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const firstTile = Math.max(0, Math.floor(contentOffset / tileDisplayWidth));
    const lastTile = Math.min(
      tiles.length - 1,
      Math.floor((contentOffset + viewportWidth) / tileDisplayWidth),
    );

    for (let t = firstTile; t <= lastTile; t++) {
      const tileLeftPx = t * tileDisplayWidth;
      const drawX = tileLeftPx - contentOffset;
      const isLastTile = t === tiles.length - 1;
      const tileFrameCount = isLastTile
        ? totalFrames - t * TILE_WIDTH
        : TILE_WIDTH;
      const drawWidth = tileFrameCount * frameDisplayWidth;

      ctx.drawImage(tiles[t], drawX, 0, drawWidth, height);
    }

    // Live playback overlay: draw a bright column at the playhead
    if (playing) {
      const frequencyData = audioService.mixer.getFrequencyData(trackId);
      if (frequencyData) {
        const playheadX = transportTime.value * pixelsPerSecond - contentOffset;
        drawLiveColumn(ctx, frequencyData, playheadX, height, color);
      }
    }
  });

  const { opacity } = useTrackVolume(trackId);

  return (
    <div
      ref={containerRef}
      className="spectrogram"
      style={{ opacity, width: containerWidth }}
    >
      <canvas ref={canvasRef} className="spectrogram__canvas" />
    </div>
  );
};

/**
 * Draws a single bright column on the canvas at the playhead position,
 * reflecting live post-effects frequency content during playback.
 *
 * Frequency bins are grouped into pixel rows (max intensity per row)
 * and rendered with additive compositing so the overlay appears brighter
 * than the static spectrogram tiles underneath.
 */
function drawLiveColumn(
  ctx: CanvasRenderingContext2D,
  frequencyData: Float32Array,
  playheadX: number,
  height: number,
  color: TrackColor,
): void {
  if (playheadX < -LIVE_COLUMN_WIDTH || playheadX > ctx.canvas.width) return;

  const bins = frequencyData.length;
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
      const intensity = dbToByte(frequencyData[bin]);
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

function dbToByte(db: number): number {
  if (db <= MIN_DB) return 0;
  if (db >= MAX_DB) return 255;
  return Math.round(((db - MIN_DB) / DB_RANGE) * 255);
}

export default Spectrogram;
