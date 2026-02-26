import { useEffect, useRef, useState } from 'react';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import { useAudioService } from '../../hooks/useAudioService';
import { useTrackVolume } from '../../hooks/useTrackVolume';
import { TrackSpectrogramEntry } from '../../services/SpectrogramCache';
import { Track } from '../project/projectPageReducer';
import './Spectrogram.css';

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

    // Derive scroll offset from the scroll parent's rect, not the sticky
    // canvas rect. Mobile compositors handle sticky positioning off the main
    // thread, so canvas.getBoundingClientRect() can return stale values.
    const scrollParentLeft = scrollParent?.getBoundingClientRect().left ?? 0;
    const containerLeft = container.getBoundingClientRect().left;
    const contentOffset = Math.max(0, scrollParentLeft - containerLeft);

    const needsResize =
      canvas.width !== viewportWidth || canvas.height !== height;

    const last = lastDrawnRef.current;
    if (
      !needsResize &&
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
