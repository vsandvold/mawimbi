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
import { spectrogramStats } from './SpectrogramStats';
import { TILE_FRAMES } from './tileConstants';
import { useSpectrogramCache } from './useSpectrogramCache';

type SpectrogramProps = {
  pixelsPerSecond: number;
  track: Track;
  isRecordingTrack?: boolean;
};

const SCRUBBER_CLASS = 'scrubber';
const PHANTOM_SCROLLER_SELECTOR = '.scrubber__phantom';

const Spectrogram = ({
  pixelsPerSecond,
  track,
  isRecordingTrack = false,
}: SpectrogramProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastDrawnRef = useRef<{
    offset: number;
    pps: number;
    tiles: ImageBitmap[] | null;
  }>({ offset: -1, pps: -1, tiles: null });
  const lastDrawnOverlayRef = useRef({
    offset: -1,
    pps: -1,
    noteCount: -1,
  });
  const recordingBufferRef = useRef<RecordingBuffer | null>(null);

  const { trackId, color, effects } = track;

  const playback = usePlaybackService();
  const recording = useRecordingService();
  const trackHook = useTrackService();
  const audioBuffer = isRecordingTrack
    ? undefined
    : trackHook.retrieveAudioBuffer(trackId);

  const entry = useSpectrogramCache(trackId, audioBuffer, color, effects);

  const startTime = isRecordingTrack
    ? 0
    : (trackHook.retrieveStartTime(trackId) ?? 0);

  const duration = audioBuffer?.duration ?? 0;

  const timeResolution = entry?.data.timeResolution ?? 0.025;
  const frameDisplayHeight = pixelsPerSecond * timeResolution;
  const tileDisplayHeight = TILE_FRAMES * frameDisplayHeight;
  const frequencyBinCount = entry?.data.frequencyBinCount ?? 0;
  // Read from stored metadata rather than `frequencyFrames.length` — the
  // raw frames are released from memory once persisted
  // (`SpectrogramCache.releaseFrames`, mawimbi#540), but `totalFrames` is
  // retained as its own field precisely so callers don't need them.
  const totalFrames = entry?.data.totalFrames ?? 0;
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

/**
 * The pre-transform region a spectrogram canvas must cover, in the
 * scrubber's scroll-content coordinate space.
 *
 * The scrubber exposes the runway's canvas window as CSS custom properties
 * (`--runway-window-top`/`--runway-window-bottom`, in the tilt box's local
 * coordinates): the span of pre-transform local Y that can project into
 * the visible area. Under a steep tilt this extends far above the box —
 * plane-space distances are much longer than the screen distances they
 * project to — which is exactly why the canvas cannot be one viewport-tall
 * slice pinned by `position: sticky` (mawimbi#459).
 *
 * Scroll position comes from the PhantomScroller — the scrubber's only
 * scroll container. The tilt stage itself is translated, not scrolled, so
 * content coordinates are `local Y + phantom.scrollTop`.
 */
type CanvasWindow = {
  /** Canvas bitmap width — the full plane width. */
  width: number;
  /** Canvas bitmap height — the window's pre-transform span. */
  height: number;
  /** Scroll-content Y of the window's top edge. */
  contentTop: number;
  /** Scroll-content Y of this track container's top edge. */
  containerTop: number;
};

function getCanvasWindow(container: HTMLDivElement): CanvasWindow {
  if (import.meta.env.DEV) spectrogramStats.incrementWindowReads();

  const scrubber = container.closest(
    `.${SCRUBBER_CLASS}`,
  ) as HTMLElement | null;
  const phantom = scrubber?.querySelector(PHANTOM_SCROLLER_SELECTOR) ?? null;
  const scrollTop = phantom?.scrollTop ?? 0;
  const width = scrubber?.clientWidth ?? window.innerWidth;
  const fallbackHeight = scrubber?.clientHeight ?? window.innerHeight;

  let windowTop = 0;
  let windowBottom = fallbackHeight;
  if (scrubber) {
    const styles = getComputedStyle(scrubber);
    const top = parseFloat(styles.getPropertyValue('--runway-window-top'));
    const bottom = parseFloat(
      styles.getPropertyValue('--runway-window-bottom'),
    );
    if (Number.isFinite(top) && Number.isFinite(bottom) && bottom > top) {
      windowTop = top;
      windowBottom = bottom;
    }
  }

  return {
    width,
    height: Math.ceil(windowBottom - windowTop),
    contentTop: scrollTop + windowTop,
    containerTop: getContentOffsetTop(container),
  };
}

/**
 * Layout position of an element within the scrubber's scroll content.
 * Walks offsetParents up to the scrubber; `offsetTop` ignores transforms,
 * so this measures the untranslated content position regardless of the
 * offset stage's current translateY.
 */
function getContentOffsetTop(container: HTMLElement): number {
  let top = 0;
  let el: HTMLElement | null = container;
  while (el && !el.classList.contains(SCRUBBER_CLASS)) {
    top += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  return top;
}

/**
 * Places the canvas over the window. The canvas is laid out at its
 * container's top (`position: absolute; top: 0`); translating it by the
 * window's offset from the container keeps it covering the window while
 * the offset stage moves the surrounding content.
 */
function positionCanvas(canvas: HTMLCanvasElement, win: CanvasWindow): void {
  const translateY = win.contentTop - win.containerTop;
  const transform = `translateY(${translateY}px)`;
  if (canvas.style.transform !== transform) {
    canvas.style.transform = transform;
  }
}

/**
 * Position of the track's time-0 edge in flipped canvas coordinates
 * (0 = canvas bottom, increasing toward the horizon). Content at time t
 * draws at `trackBase + t × pixelsPerSecond`.
 */
function getTrackBase(win: CanvasWindow, contentLength: number): number {
  return win.contentTop + win.height - (win.containerTop + contentLength);
}

/**
 * Flips the canvas Y-axis so that y=0 draws at the bottom of the canvas.
 * This makes time=0 content appear at the bottom (beginning at the bottom).
 */
function flipCanvasY(ctx: CanvasRenderingContext2D, canvasHeight: number) {
  ctx.translate(0, canvasHeight);
  ctx.scale(1, -1);
}

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

  // Measured after the height/margin writes above so the layout offset
  // reflects this frame's content size.
  const win = getCanvasWindow(container);
  positionCanvas(canvas, win);
  const trackBase = getTrackBase(win, contentHeight);

  const needsResize =
    canvas.width !== win.width || canvas.height !== win.height;
  if (needsResize) {
    canvas.width = win.width;
    canvas.height = win.height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Visible slice of the recording content, in flipped canvas coords.
  const visibleStart = Math.max(0, trackBase);
  const visibleEnd = Math.min(win.height, trackBase + contentHeight);
  if (visibleEnd <= visibleStart || contentHeight <= 0) return;

  ctx.save();
  flipCanvasY(ctx, win.height);

  // Map buffer frames (1 frame = 1 pixel in the buffer) to display pixels.
  // bufferFrames maps to contentHeight display pixels.
  const framesPerPixel = buffer.frameCount / contentHeight;
  const destHeight = visibleEnd - visibleStart;
  const srcY = Math.floor((visibleStart - trackBase) * framesPerPixel);
  const srcHeight = Math.min(
    Math.ceil(destHeight * framesPerPixel),
    buffer.frameCount - srcY,
  );

  buffer.drawTo(ctx, srcY, srcHeight, visibleStart, destHeight, win.width);

  ctx.restore();
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
    tiles: ImageBitmap[] | null;
  }>,
): void {
  const contentLength = duration * pixelsPerSecond;
  const win = getCanvasWindow(container);
  positionCanvas(canvas, win);
  const trackBase = getTrackBase(win, contentLength);

  const needsResize =
    canvas.width !== win.width || canvas.height !== win.height;

  const last = lastDrawnRef.current;
  if (
    !needsResize &&
    trackBase === last.offset &&
    pixelsPerSecond === last.pps &&
    tiles === last.tiles
  ) {
    return;
  }
  last.offset = trackBase;
  last.pps = pixelsPerSecond;
  last.tiles = tiles;
  if (import.meta.env.DEV) spectrogramStats.incrementDrawCalls();

  if (needsResize) {
    canvas.width = win.width;
    canvas.height = win.height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  flipCanvasY(ctx, win.height);

  // Tile t spans [trackBase + t·tileH, ...] in flipped coords; draw the
  // tiles that intersect the canvas span [0, win.height].
  const firstTile = Math.max(0, Math.floor(-trackBase / tileDisplayHeight));
  const lastTile = Math.min(
    tiles.length - 1,
    Math.floor((win.height - trackBase) / tileDisplayHeight),
  );

  for (let t = firstTile; t <= lastTile; t++) {
    const drawY = trackBase + t * tileDisplayHeight;
    const isLastTile = t === tiles.length - 1;
    const tileFrameCount = isLastTile
      ? totalFrames - t * TILE_FRAMES
      : TILE_FRAMES;
    const drawHeight = tileFrameCount * frameDisplayHeight;

    ctx.drawImage(tiles[t], 0, drawY, win.width, drawHeight);
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
  const win = getCanvasWindow(container);
  positionCanvas(canvas, win);
  const trackBase = getTrackBase(win, contentLength);

  const needsResize =
    canvas.width !== win.width || canvas.height !== win.height;

  // During playback, always redraw to update the playhead glow effect.
  // When stopped, use memoization to skip unchanged frames.
  const last = lastDrawnOverlayRef.current;
  if (
    !isPlaying &&
    !needsResize &&
    trackBase === last.offset &&
    pixelsPerSecond === last.pps &&
    notes.length === last.noteCount
  ) {
    return;
  }
  last.offset = trackBase;
  last.pps = pixelsPerSecond;
  last.noteCount = notes.length;

  if (needsResize) {
    canvas.width = win.width;
    canvas.height = win.height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  flipCanvasY(ctx, win.height);

  // Playhead time relative to this track's start time
  const trackPlayheadTime = playheadTime - startTime;

  const viewport: PianoRollViewport = {
    pixelsPerSecond,
    // The renderer draws note t at `t·pps − contentOffset` in flipped
    // coords; the canvas bottom sits at −trackBase in flipped track coords.
    contentOffset: -trackBase,
    viewportHeight: win.height,
    canvasWidth: win.width,
    frequencyBinCount,
    playheadTime: trackPlayheadTime,
  };

  drawPianoRoll(ctx, notes, color, viewport);

  ctx.restore();
}

export default Spectrogram;
