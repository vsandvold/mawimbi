import { useEffect, useRef } from 'react';
import { useAnimationFrame } from '../../shared/hooks/useAnimationFrame';
import { usePlaybackService } from '../playback/usePlaybackService';
import { useRecordingService } from '../recording/useRecordingService';
import { useTrackService } from '../tracks/useTrackService';
import { useTrackVolume } from '../../shared/hooks/useTrackVolume';
import FrequencyVisualizer from './FrequencyVisualizer';
import { type MelodyNote } from '../transcription/MelodyExtractor';
import { type TrackColor } from '../tracks/types';
import { type Track } from '../tracks/types';
import { drawPianoRoll, type PianoRollViewport } from './PianoRollRenderer';
import RecordingBuffer from './RecordingBuffer';
import './Spectrogram.css';
import { useSpectrogramCache } from './useSpectrogramCache';

type SpectrogramProps = {
  pixelsPerSecond: number;
  track: Track;
  isRecordingTrack?: boolean;
};

const TILE_FRAMES = 4096;
const SCROLL_CONTAINER_CLASS = '.scrubber__tilt';

const Spectrogram = ({
  pixelsPerSecond,
  track,
  isRecordingTrack = false,
}: SpectrogramProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastDrawnRef = useRef({ offset: -1, pps: -1, tileCount: -1 });
  const lastDrawnOverlayRef = useRef({
    offset: -1,
    pps: -1,
    noteCount: -1,
  });
  const recordingBufferRef = useRef<RecordingBuffer | null>(null);

  const { trackId, color } = track;

  const playback = usePlaybackService();
  const recording = useRecordingService();
  const trackHook = useTrackService();
  const audioBuffer = isRecordingTrack
    ? undefined
    : trackHook.retrieveAudioBuffer(trackId);

  const entry = useSpectrogramCache(trackId, audioBuffer, color);

  const startTime = isRecordingTrack
    ? 0
    : (trackHook.retrieveStartTime(trackId) ?? 0);

  const duration = audioBuffer?.duration ?? 0;

  const timeResolution = entry?.data.timeResolution ?? 0.025;
  const frameDisplayHeight = pixelsPerSecond * timeResolution;
  const tileDisplayHeight = TILE_FRAMES * frameDisplayHeight;
  const frequencyBinCount = entry?.data.frequencyBinCount ?? 0;
  const totalFrames = entry?.data.frequencyFrames.length ?? 0;
  const tiles = entry?.tiles ?? [];
  const melodyNotes = entry?.melody?.notes ?? [];

  const visualizerRef = useRef<FrequencyVisualizer | null>(null);

  // Create/dispose recording buffer and visualizer when entering/leaving recording mode
  useEffect(() => {
    if (isRecordingTrack) {
      const workletAnalyser = recording.getWorkletAnalyser() ?? undefined;
      const visualizer = new FrequencyVisualizer(
        recording.getMicrophoneSource(),
        { workletAnalyser },
      );
      visualizerRef.current = visualizer;
      recordingBufferRef.current = new RecordingBuffer(
        color,
        visualizer.frequencyBinCount,
      );
    }
    return () => {
      visualizerRef.current?.dispose();
      visualizerRef.current = null;
      recordingBufferRef.current = null;
    };
    // Hook objects reference stable service singletons via getters
  }, [isRecordingTrack, color]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw visible tiles and melody overlay on each animation frame
  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (isRecordingTrack) {
      drawRecordingFrame(
        canvas,
        container,
        recordingBufferRef.current,
        visualizerRef.current,
        recording,
        playback,
        pixelsPerSecond,
      );
      return;
    }

    if (tiles.length === 0) return;

    drawTilesFrame(
      canvas,
      container,
      pixelsPerSecond,
      tiles,
      totalFrames,
      frameDisplayHeight,
      tileDisplayHeight,
      duration,
      lastDrawnRef,
    );

    if (overlay && melodyNotes.length > 0) {
      drawMelodyOverlay(
        overlay,
        container,
        pixelsPerSecond,
        melodyNotes,
        color,
        frequencyBinCount,
        duration,
        startTime,
        playback.getEngineTime(),
        playback.isPlaying,
        lastDrawnOverlayRef,
      );
    }
  });

  const { opacity } = useTrackVolume(trackId);

  // For non-recording tracks, height is set from audio buffer duration.
  // For recording tracks, height is updated in the rAF loop directly on the
  // DOM node to avoid React re-renders at 60fps.
  const containerHeight = isRecordingTrack ? 0 : duration * pixelsPerSecond;
  const containerMarginBottom = startTime * pixelsPerSecond;

  return (
    <div
      ref={containerRef}
      className="spectrogram"
      style={{
        opacity,
        height: containerHeight,
        marginBottom: containerMarginBottom,
      }}
    >
      <canvas ref={canvasRef} className="spectrogram__canvas" />
      <canvas ref={overlayRef} className="spectrogram__overlay" />
    </div>
  );
};

function drawRecordingFrame(
  canvas: HTMLCanvasElement,
  container: HTMLDivElement,
  buffer: RecordingBuffer | null,
  visualizer: FrequencyVisualizer | null,
  recordingHook: ReturnType<typeof useRecordingService>,
  playbackHook: ReturnType<typeof usePlaybackService>,
  pixelsPerSecond: number,
): void {
  if (!buffer || !visualizer) return;

  const isRecActive = recordingHook.isOverdubRecording();
  const recordingStartTime = recordingHook.getRecordingStartTime();
  // Read engine time directly instead of the transportTime signal.
  // The signal is updated by the Scrubber animation loop which only runs
  // when playbackState is 'playing'. During the first recording from
  // position 0, playback.play() is never called (no count-in lead-in),
  // so the signal stays at 0 even though the transport is running.
  const elapsed = Math.max(
    0,
    playbackHook.getEngineTime() - recordingStartTime,
  );
  const contentHeight = elapsed * pixelsPerSecond;

  // Update container height and offset directly to avoid React re-renders
  container.style.height = `${contentHeight}px`;
  container.style.marginBottom = `${recordingStartTime * pixelsPerSecond}px`;

  // Accumulate a new frame while recording is active
  if (isRecActive) {
    const frequencyData = visualizer.getVisualizationData();
    buffer.addFrame(frequencyData);
  }

  if (buffer.frameCount === 0) return;

  const { viewportWidth, viewportHeight, contentOffset, maxContentOffset } =
    getViewportInfo(container, contentHeight);

  // Flip: map DOM content offset to inverted content offset
  const flippedOffset = maxContentOffset - contentOffset;

  // When content is shorter than the viewport, shift drawing up (in flipped
  // coords) so content stays within the container bounds instead of being
  // rendered at the canvas bottom (which extends past the container).
  const drawYOffset = Math.max(0, viewportHeight - contentHeight);

  const needsResize =
    canvas.width !== viewportWidth || canvas.height !== viewportHeight;
  if (needsResize) {
    canvas.width = viewportWidth;
    canvas.height = viewportHeight;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  flipCanvasY(ctx, viewportHeight);

  // Map buffer frames (1 frame = 1 pixel in the buffer) to display pixels.
  // bufferFrames maps to contentHeight display pixels.
  const framesPerPixel = buffer.frameCount / contentHeight;
  // Clamp destination height so the buffer is never stretched beyond the
  // actual content area. Without this, when the recording is shorter than
  // the viewport the buffer was drawn across the full viewport height,
  // making the spectrogram appear to move faster than existing tracks.
  const destHeight = Math.min(viewportHeight, contentHeight - flippedOffset);
  const srcY = Math.floor(flippedOffset * framesPerPixel);
  const srcHeight = Math.min(
    Math.ceil(destHeight * framesPerPixel),
    buffer.frameCount - srcY,
  );

  buffer.drawTo(ctx, srcY, srcHeight, drawYOffset, destHeight, viewportWidth);

  ctx.restore();
}

type ViewportInfo = {
  viewportWidth: number;
  viewportHeight: number;
  contentOffset: number;
  maxContentOffset: number;
};

/**
 * Computes viewport dimensions and content offset for a spectrogram container.
 * The content offset measures how far into the DOM content the viewport's top
 * edge has scrolled. With marginBottom positioning, all containers start at
 * the grid cell top (paddingTop) — no top margin to subtract.
 */
function getViewportInfo(
  container: HTMLDivElement,
  contentLength: number,
): ViewportInfo {
  const scrollParent = container.closest(SCROLL_CONTAINER_CLASS);
  const viewportWidth = scrollParent?.clientWidth ?? window.innerWidth;
  const viewportHeight = scrollParent?.clientHeight ?? window.innerHeight;

  const scrollTop = scrollParent?.scrollTop ?? 0;
  const timeline = container.closest('.timeline');
  const paddingTop = timeline
    ? parseFloat(getComputedStyle(timeline).paddingTop) || 0
    : 0;
  const maxContentOffset = Math.max(0, contentLength - viewportHeight);
  const contentOffset = Math.min(
    Math.max(0, scrollTop - paddingTop),
    maxContentOffset,
  );

  return { viewportWidth, viewportHeight, contentOffset, maxContentOffset };
}

/**
 * Flips the canvas Y-axis so that y=0 draws at the bottom of the canvas.
 * This makes time=0 content appear at the bottom (beginning at the bottom).
 */
function flipCanvasY(ctx: CanvasRenderingContext2D, viewportHeight: number) {
  ctx.translate(0, viewportHeight);
  ctx.scale(1, -1);
}

function drawTilesFrame(
  canvas: HTMLCanvasElement,
  container: HTMLDivElement,
  pixelsPerSecond: number,
  tiles: ImageBitmap[],
  totalFrames: number,
  frameDisplayHeight: number,
  tileDisplayHeight: number,
  duration: number,
  lastDrawnRef: React.MutableRefObject<{
    offset: number;
    pps: number;
    tileCount: number;
  }>,
): void {
  const contentLength = duration * pixelsPerSecond;
  const { viewportWidth, viewportHeight, contentOffset, maxContentOffset } =
    getViewportInfo(container, contentLength);

  // Flip: map DOM content offset to inverted content offset so that
  // tile 0 (beginning) draws at the bottom of the canvas.
  const flippedOffset = maxContentOffset - contentOffset;

  // When content is shorter than the viewport, shift drawing up (in flipped
  // coords) so content stays within the container bounds instead of being
  // rendered at the canvas bottom (which extends past the container).
  const drawYOffset = Math.max(0, viewportHeight - contentLength);

  const needsResize =
    canvas.width !== viewportWidth || canvas.height !== viewportHeight;

  const last = lastDrawnRef.current;
  if (
    !needsResize &&
    flippedOffset === last.offset &&
    pixelsPerSecond === last.pps &&
    tiles.length === last.tileCount
  ) {
    return;
  }
  last.offset = flippedOffset;
  last.pps = pixelsPerSecond;
  last.tileCount = tiles.length;

  if (needsResize) {
    canvas.width = viewportWidth;
    canvas.height = viewportHeight;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  flipCanvasY(ctx, viewportHeight);

  const firstTile = Math.max(0, Math.floor(flippedOffset / tileDisplayHeight));
  const lastTile = Math.min(
    tiles.length - 1,
    Math.floor((flippedOffset + viewportHeight) / tileDisplayHeight),
  );

  for (let t = firstTile; t <= lastTile; t++) {
    const tileTopPx = t * tileDisplayHeight;
    const drawY = tileTopPx - flippedOffset + drawYOffset;
    const isLastTile = t === tiles.length - 1;
    const tileFrameCount = isLastTile
      ? totalFrames - t * TILE_FRAMES
      : TILE_FRAMES;
    const drawHeight = tileFrameCount * frameDisplayHeight;

    ctx.drawImage(tiles[t], 0, drawY, viewportWidth, drawHeight);
  }

  ctx.restore();
}

function drawMelodyOverlay(
  canvas: HTMLCanvasElement,
  container: HTMLDivElement,
  pixelsPerSecond: number,
  notes: MelodyNote[],
  color: TrackColor,
  frequencyBinCount: number,
  duration: number,
  startTime: number,
  playheadTime: number,
  isPlaying: boolean,
  lastDrawnOverlayRef: React.MutableRefObject<{
    offset: number;
    pps: number;
    noteCount: number;
  }>,
): void {
  const contentLength = duration * pixelsPerSecond;
  const { viewportWidth, viewportHeight, contentOffset, maxContentOffset } =
    getViewportInfo(container, contentLength);

  // Flip: map DOM content offset to inverted content offset
  const flippedOffset = maxContentOffset - contentOffset;

  // When content is shorter than the viewport, shift drawing up (in flipped
  // coords) so content stays within the container bounds.
  const drawYOffset = Math.max(0, viewportHeight - contentLength);

  const needsResize =
    canvas.width !== viewportWidth || canvas.height !== viewportHeight;

  // During playback, always redraw to update the playhead glow effect.
  // When stopped, use memoization to skip unchanged frames.
  const last = lastDrawnOverlayRef.current;
  if (
    !isPlaying &&
    !needsResize &&
    flippedOffset === last.offset &&
    pixelsPerSecond === last.pps &&
    notes.length === last.noteCount
  ) {
    return;
  }
  last.offset = flippedOffset;
  last.pps = pixelsPerSecond;
  last.noteCount = notes.length;

  if (needsResize) {
    canvas.width = viewportWidth;
    canvas.height = viewportHeight;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  flipCanvasY(ctx, viewportHeight);

  // Playhead time relative to this track's start time
  const trackPlayheadTime = playheadTime - startTime;

  const viewport: PianoRollViewport = {
    pixelsPerSecond,
    contentOffset: flippedOffset - drawYOffset,
    viewportHeight,
    canvasWidth: viewportWidth,
    frequencyBinCount,
    playheadTime: trackPlayheadTime,
  };

  drawPianoRoll(ctx, notes, color, viewport);

  ctx.restore();
}

export default Spectrogram;
