import { useRef } from 'react';
import { useAnimationFrame } from '../../../hooks/useAnimationFrame';
import { useAudioService } from '../../../hooks/useAudioService';
import { useTrackVolume } from '../../../hooks/useTrackVolume';
import { isPlaying, transportTime } from '../../../signals/transportSignals';
import { type Track } from '../../../types/track';
import './Spectrogram.css';
import { drawLiveColumn } from './spectrogramRenderer';
import { useSpectrogramCache } from './useSpectrogramCache';

type SpectrogramProps = {
  height: number;
  pixelsPerSecond: number;
  track: Track;
};

const TILE_WIDTH = 4096;
const SCROLL_CONTAINER_CLASS = '.scrubber__timeline';

const Spectrogram = ({ height, pixelsPerSecond, track }: SpectrogramProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastDrawnRef = useRef({ offset: -1, pps: -1, tileCount: -1 });

  const { trackId, color } = track;

  const audioService = useAudioService();
  const audioBuffer = audioService.retrieveAudioBuffer(trackId);

  const entry = useSpectrogramCache(trackId, audioBuffer, color);

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

export default Spectrogram;
