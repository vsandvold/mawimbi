import { useEffect, useRef } from 'react';
import { useAnimationFrame } from '../../../hooks/useAnimationFrame';
import { usePlaybackService } from '../../../hooks/usePlaybackService';
import { useRecordingService } from '../../../hooks/useRecordingService';
import { useTrackService } from '../../../hooks/useTrackService';
import { useTrackVolume } from '../../../hooks/useTrackVolume';
import FrequencyVisualizer from '../../../services/FrequencyVisualizer';
import { type MelodyNote } from '../../../services/MelodyExtractor';
import { type TrackColor } from '../../../types/track';
import { type Track } from '../../../types/track';
import { drawPianoRoll, type PianoRollViewport } from './PianoRollRenderer';
import RecordingBuffer from './RecordingBuffer';
import './Spectrogram.css';
import { useSpectrogramCache } from './useSpectrogramCache';

type SpectrogramProps = {
  height: number;
  pixelsPerSecond: number;
  track: Track;
  isRecordingTrack?: boolean;
};

const TILE_WIDTH = 4096;
const SCROLL_CONTAINER_CLASS = '.scrubber__timeline';

const Spectrogram = ({
  height,
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
  const frameDisplayWidth = pixelsPerSecond * timeResolution;
  const tileDisplayWidth = TILE_WIDTH * frameDisplayWidth;
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
        height,
      );
      return;
    }

    if (tiles.length === 0) return;

    drawTilesFrame(
      canvas,
      container,
      pixelsPerSecond,
      height,
      tiles,
      totalFrames,
      frameDisplayWidth,
      tileDisplayWidth,
      duration,
      lastDrawnRef,
    );

    if (overlay && melodyNotes.length > 0) {
      drawMelodyOverlay(
        overlay,
        container,
        pixelsPerSecond,
        height,
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

  // For non-recording tracks, width is set from audio buffer duration.
  // For recording tracks, width is updated in the rAF loop directly on the
  // DOM node to avoid React re-renders at 60fps.
  const containerWidth = isRecordingTrack ? 0 : duration * pixelsPerSecond;
  const containerMarginLeft = startTime * pixelsPerSecond;

  return (
    <div
      ref={containerRef}
      className="spectrogram"
      style={{
        opacity,
        width: containerWidth,
        marginLeft: containerMarginLeft,
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
  height: number,
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
  const contentWidth = elapsed * pixelsPerSecond;

  // Update container width and offset directly to avoid React re-renders
  container.style.width = `${contentWidth}px`;
  container.style.marginLeft = `${recordingStartTime * pixelsPerSecond}px`;

  // Accumulate a new frame while recording is active
  if (isRecActive) {
    const frequencyData = visualizer.getVisualizationData();
    buffer.addFrame(frequencyData);
  }

  if (buffer.frameCount === 0) return;

  const scrollParent = container.closest(SCROLL_CONTAINER_CLASS);
  const viewportWidth = scrollParent?.clientWidth ?? window.innerWidth;

  const scrollLeft = scrollParent?.scrollLeft ?? 0;
  const timeline = container.closest('.timeline');
  const paddingLeft = timeline
    ? parseFloat(getComputedStyle(timeline).paddingLeft) || 0
    : 0;
  const containerMarginLeft = parseFloat(container.style.marginLeft) || 0;
  const maxContentOffset = Math.max(0, contentWidth - viewportWidth);
  const contentOffset = Math.min(
    Math.max(0, scrollLeft - paddingLeft - containerMarginLeft),
    maxContentOffset,
  );

  const needsResize =
    canvas.width !== viewportWidth || canvas.height !== height;
  if (needsResize) {
    canvas.width = viewportWidth;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Map buffer frames (1 frame = 1 pixel in the buffer) to display pixels.
  // bufferFrames maps to contentWidth display pixels.
  const framesPerPixel = buffer.frameCount / contentWidth;
  // Clamp destination width so the buffer is never stretched beyond the
  // actual content area. Without this, when the recording is shorter than
  // the viewport the buffer was drawn across the full viewport width,
  // making the spectrogram appear to move faster than existing tracks.
  const destWidth = Math.min(viewportWidth, contentWidth - contentOffset);
  const srcX = Math.floor(contentOffset * framesPerPixel);
  const srcWidth = Math.min(
    Math.ceil(destWidth * framesPerPixel),
    buffer.frameCount - srcX,
  );

  buffer.drawTo(ctx, srcX, srcWidth, 0, destWidth, height);
}

function drawTilesFrame(
  canvas: HTMLCanvasElement,
  container: HTMLDivElement,
  pixelsPerSecond: number,
  height: number,
  tiles: ImageBitmap[],
  totalFrames: number,
  frameDisplayWidth: number,
  tileDisplayWidth: number,
  duration: number,
  lastDrawnRef: React.MutableRefObject<{
    offset: number;
    pps: number;
    tileCount: number;
  }>,
): void {
  const containerWidth = duration * pixelsPerSecond;

  const scrollParent = container.closest(SCROLL_CONTAINER_CLASS);
  const viewportWidth = scrollParent?.clientWidth ?? window.innerWidth;

  const scrollLeft = scrollParent?.scrollLeft ?? 0;
  const timeline = container.closest('.timeline');
  const paddingLeft = timeline
    ? parseFloat(getComputedStyle(timeline).paddingLeft) || 0
    : 0;
  const containerMarginLeft = parseFloat(container.style.marginLeft) || 0;
  const maxContentOffset = Math.max(0, containerWidth - viewportWidth);
  const contentOffset = Math.min(
    Math.max(0, scrollLeft - paddingLeft - containerMarginLeft),
    maxContentOffset,
  );

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
}

function drawMelodyOverlay(
  canvas: HTMLCanvasElement,
  container: HTMLDivElement,
  pixelsPerSecond: number,
  height: number,
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
  const containerWidth = duration * pixelsPerSecond;

  const scrollParent = container.closest(SCROLL_CONTAINER_CLASS);
  const viewportWidth = scrollParent?.clientWidth ?? window.innerWidth;

  const scrollLeft = scrollParent?.scrollLeft ?? 0;
  const timeline = container.closest('.timeline');
  const paddingLeft = timeline
    ? parseFloat(getComputedStyle(timeline).paddingLeft) || 0
    : 0;
  const containerMarginLeft = parseFloat(container.style.marginLeft) || 0;
  const maxContentOffset = Math.max(0, containerWidth - viewportWidth);
  const contentOffset = Math.min(
    Math.max(0, scrollLeft - paddingLeft - containerMarginLeft),
    maxContentOffset,
  );

  const needsResize =
    canvas.width !== viewportWidth || canvas.height !== height;

  // During playback, always redraw to update the playhead glow effect.
  // When stopped, use memoization to skip unchanged frames.
  const last = lastDrawnOverlayRef.current;
  if (
    !isPlaying &&
    !needsResize &&
    contentOffset === last.offset &&
    pixelsPerSecond === last.pps &&
    notes.length === last.noteCount
  ) {
    return;
  }
  last.offset = contentOffset;
  last.pps = pixelsPerSecond;
  last.noteCount = notes.length;

  if (needsResize) {
    canvas.width = viewportWidth;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Playhead time relative to this track's start time
  const trackPlayheadTime = playheadTime - startTime;

  const viewport: PianoRollViewport = {
    pixelsPerSecond,
    contentOffset,
    viewportWidth,
    canvasHeight: height,
    frequencyBinCount,
    playheadTime: trackPlayheadTime,
  };

  drawPianoRoll(ctx, notes, color, viewport);
}

export default Spectrogram;
