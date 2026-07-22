import { useEffect, useRef } from 'react';
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
import {
  timelineRenderLoop,
  type SharedCanvasWindow,
} from './TimelineRenderLoop';
import { useSpectrogramCache } from './useSpectrogramCache';

type SpectrogramProps = {
  pixelsPerSecond: number;
  track: Track;
  isRecordingTrack?: boolean;
};

const SCRUBBER_CLASS = 'scrubber';

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
    // 0, not -1: `writeMelodyOverlay` only ever runs when `notes.length > 0`
    // (see the `write` registration below), so a track with no melody notes
    // at all would never update this away from a sentinel that isn't a
    // real note count — leaving `peekDirty`'s `0 !== sentinel` comparison
    // permanently true and defeating the render loop's idle short-circuit.
    noteCount: 0,
    activeNotesKey: '',
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

  // Latest render's values, read by the render-loop registration below —
  // that registration is created once per mount (not on every prop change),
  // matching the previous useAnimationFrame callback-ref pattern.
  const latestRef = useRef({
    pixelsPerSecond,
    tiles,
    totalFrames,
    frameDisplayHeight,
    tileDisplayHeight,
    duration,
    melodyNotes,
    color,
    frequencyBinCount,
    startTime,
  });
  latestRef.current = {
    pixelsPerSecond,
    tiles,
    totalFrames,
    frameDisplayHeight,
    tileDisplayHeight,
    duration,
    melodyNotes,
    color,
    frequencyBinCount,
    startTime,
  };

  // Register with the shared TimelineRenderLoop (mawimbi#541) instead of an
  // always-on per-track rAF loop. Measure (DOM reads) and write (DOM/canvas
  // writes) run as separate phases across every mounted track, so the loop
  // can batch them and short-circuit whole frames where nothing changed.
  useEffect(() => {
    const tileMeasurement: TileFrameMeasurement = { containerTop: 0 };
    const recordingMeasurement: RecordingFrameMeasurement = {
      containerTop: 0,
      contentHeight: 0,
      recordingStartTime: 0,
      isBufferReady: false,
    };

    const unregister = timelineRenderLoop.register({
      bypassIdle: isRecordingTrack,
      peekDirty: () => {
        const { tiles, pixelsPerSecond, melodyNotes } = latestRef.current;
        if (tiles.length === 0) return false;
        return (
          tiles !== lastDrawnRef.current.tiles ||
          pixelsPerSecond !== lastDrawnRef.current.pps ||
          melodyNotes.length !== lastDrawnOverlayRef.current.noteCount
        );
      },
      measure: () => {
        const container = containerRef.current;
        if (!container) return;

        if (isRecordingTrack) {
          measureRecordingFrame(
            container,
            recordingBufferRef.current,
            visualizerRef.current,
            recording,
            playback,
            latestRef.current.pixelsPerSecond,
            recordingMeasurement,
          );
          return;
        }

        measureTileFrame(container, tileMeasurement);
      },
      write: (win) => {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        if (isRecordingTrack) {
          writeRecordingFrame(
            canvas,
            container,
            recordingBufferRef.current,
            win,
            recordingMeasurement,
            latestRef.current.pixelsPerSecond,
          );
          return;
        }

        const {
          pixelsPerSecond,
          tiles,
          totalFrames,
          frameDisplayHeight,
          tileDisplayHeight,
          duration,
          melodyNotes,
          color,
          frequencyBinCount,
          startTime,
        } = latestRef.current;

        if (tiles.length === 0) return;

        writeTileFrame(
          canvas,
          win,
          tileMeasurement,
          pixelsPerSecond,
          tiles,
          totalFrames,
          frameDisplayHeight,
          tileDisplayHeight,
          duration,
          lastDrawnRef,
        );

        if (overlay && melodyNotes.length > 0) {
          writeMelodyOverlay(
            overlay,
            win,
            tileMeasurement,
            pixelsPerSecond,
            melodyNotes,
            color,
            frequencyBinCount,
            duration,
            startTime,
            playback.getEngineTime(),
            lastDrawnOverlayRef,
          );
        }
      },
    });

    return unregister;
    // Hook objects reference stable service singletons via getters; latest
    // prop/state values are read from latestRef instead of closed over here
    // — the registration itself must stay stable across renders.
  }, [isRecordingTrack]); // eslint-disable-line react-hooks/exhaustive-deps

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
type CanvasWindow = SharedCanvasWindow & {
  /** Scroll-content Y of this track container's top edge. */
  containerTop: number;
};

/**
 * Layout position of an element within the scrubber's scroll content.
 * Walks offsetParents up to the scrubber; `offsetTop` ignores transforms,
 * so this measures the untranslated content position regardless of the
 * offset stage's current translateY. This is the one per-track DOM read
 * `TimelineRenderLoop` can't hoist into its once-per-frame shared window —
 * every mounted track has its own container position — so it stays here,
 * confined to each registration's `measure` phase.
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

type TileFrameMeasurement = {
  containerTop: number;
};

/** Per-track DOM read for the tile/melody-overlay path — see `getContentOffsetTop`. */
function measureTileFrame(
  container: HTMLDivElement,
  held: TileFrameMeasurement,
): void {
  held.containerTop = getContentOffsetTop(container);
}

function toTrackWindow(
  win: SharedCanvasWindow,
  containerTop: number,
): CanvasWindow {
  return {
    width: win.width,
    height: win.height,
    contentTop: win.contentTop,
    containerTop,
  };
}

type RecordingFrameMeasurement = {
  containerTop: number;
  contentHeight: number;
  recordingStartTime: number;
  isBufferReady: boolean;
};

/**
 * Recording-frame measure phase: accumulates this tick's audio frame (not a
 * DOM operation — safe here) and reads `containerTop`, but does **not**
 * write `container.style.height`/`marginBottom` — those writes happen in
 * `writeRecordingFrame` instead, so every registered callback's DOM reads
 * run before any callback's DOM writes this frame (mawimbi#541 Goal 4,
 * fixing the per-frame forced synchronous layout of #469 item 2).
 */
function measureRecordingFrame(
  container: HTMLDivElement,
  buffer: RecordingBuffer | null,
  visualizer: FrequencyVisualizer | null,
  recordingHook: ReturnType<typeof useRecordingService>,
  playbackHook: ReturnType<typeof usePlaybackService>,
  pixelsPerSecond: number,
  held: RecordingFrameMeasurement,
): void {
  if (!buffer || !visualizer) {
    held.isBufferReady = false;
    return;
  }
  held.isBufferReady = true;

  const isRecActive = recordingHook.isOverdubRecording();
  held.recordingStartTime = recordingHook.getRecordingStartTime();
  // Read engine time directly instead of the transportTime signal.
  // The signal is updated by the Scrubber animation loop which only runs
  // when playbackState is 'playing'. During the first recording from
  // position 0, playback.play() is never called (no count-in lead-in),
  // so the signal stays at 0 even though the transport is running.
  const elapsed = Math.max(
    0,
    playbackHook.getEngineTime() - held.recordingStartTime,
  );
  held.contentHeight = elapsed * pixelsPerSecond;

  // Accumulate a new frame while recording is active
  if (isRecActive) {
    const frequencyData = visualizer.getVisualizationData();
    buffer.addFrame(frequencyData);
  }

  held.containerTop = getContentOffsetTop(container);
}

function writeRecordingFrame(
  canvas: HTMLCanvasElement,
  container: HTMLDivElement,
  buffer: RecordingBuffer | null,
  win: SharedCanvasWindow,
  held: RecordingFrameMeasurement,
  pixelsPerSecond: number,
): void {
  if (!held.isBufferReady || !buffer) return;

  // Update container height and offset directly to avoid React re-renders
  container.style.height = `${held.contentHeight}px`;
  container.style.marginBottom = `${held.recordingStartTime * pixelsPerSecond}px`;

  if (buffer.frameCount === 0) return;

  const trackWin = toTrackWindow(win, held.containerTop);
  positionCanvas(canvas, trackWin);
  const trackBase = getTrackBase(trackWin, held.contentHeight);

  const needsResize =
    canvas.width !== trackWin.width || canvas.height !== trackWin.height;
  if (needsResize) {
    canvas.width = trackWin.width;
    canvas.height = trackWin.height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Visible slice of the recording content, in flipped canvas coords.
  const visibleStart = Math.max(0, trackBase);
  const visibleEnd = Math.min(trackWin.height, trackBase + held.contentHeight);
  if (visibleEnd <= visibleStart || held.contentHeight <= 0) return;

  ctx.save();
  flipCanvasY(ctx, trackWin.height);

  // Map buffer frames (1 frame = 1 pixel in the buffer) to display pixels.
  // bufferFrames maps to contentHeight display pixels.
  const framesPerPixel = buffer.frameCount / held.contentHeight;
  const destHeight = visibleEnd - visibleStart;
  const srcY = Math.floor((visibleStart - trackBase) * framesPerPixel);
  const srcHeight = Math.min(
    Math.ceil(destHeight * framesPerPixel),
    buffer.frameCount - srcY,
  );

  buffer.drawTo(ctx, srcY, srcHeight, visibleStart, destHeight, trackWin.width);

  ctx.restore();
}

// Height, in canvas pixels, of the alpha fade applied toward the runway's
// far edge (mawimbi#468 option 2) — an arbitrary but visually comfortable
// fraction of the default `runwayLengthPx` (1800px); not derived from it,
// since the fade lives in canvas pixel space while `runwayLengthPx` is
// pre-transform plane space and the two aren't meant to track each other.
const FAR_EDGE_FADE_PX = 200;

/**
 * Fades the last `FAR_EDGE_FADE_PX` of drawn content toward the canvas's
 * top row — the runway's far edge in this component's flipped-Y coordinate
 * space (`flipCanvasY` puts time 0 at the canvas bottom, so increasing time
 * runs toward the top). Only applied when the track's content actually
 * continues past the visible window; a track that ends within the window
 * already trails into transparent canvas, so fading it too would just dim
 * real, already-visible content for no reason.
 */
function applyFarEdgeFade(
  ctx: CanvasRenderingContext2D,
  win: CanvasWindow,
  trackBase: number,
  contentLength: number,
): void {
  const contentExtendsPastWindow = trackBase + contentLength > win.height;
  if (!contentExtendsPastWindow) return;

  const fadeHeight = Math.min(FAR_EDGE_FADE_PX, win.height);
  if (fadeHeight <= 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const gradient = ctx.createLinearGradient(0, 0, 0, fadeHeight);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, win.width, fadeHeight);
  ctx.restore();
}

function writeTileFrame(
  canvas: HTMLCanvasElement,
  win: SharedCanvasWindow,
  held: TileFrameMeasurement,
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
  const trackWin = toTrackWindow(win, held.containerTop);
  positionCanvas(canvas, trackWin);
  const trackBase = getTrackBase(trackWin, contentLength);

  const needsResize =
    canvas.width !== trackWin.width || canvas.height !== trackWin.height;

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
    canvas.width = trackWin.width;
    canvas.height = trackWin.height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  flipCanvasY(ctx, trackWin.height);

  // Tile t spans [trackBase + t·tileH, ...] in flipped coords; draw the
  // tiles that intersect the canvas span [0, win.height].
  const firstTile = Math.max(0, Math.floor(-trackBase / tileDisplayHeight));
  const lastTile = Math.min(
    tiles.length - 1,
    Math.floor((trackWin.height - trackBase) / tileDisplayHeight),
  );

  for (let t = firstTile; t <= lastTile; t++) {
    const drawY = trackBase + t * tileDisplayHeight;
    const isLastTile = t === tiles.length - 1;
    const tileFrameCount = isLastTile
      ? totalFrames - t * TILE_FRAMES
      : TILE_FRAMES;
    const drawHeight = tileFrameCount * frameDisplayHeight;

    ctx.drawImage(tiles[t], 0, drawY, trackWin.width, drawHeight);
  }

  ctx.restore();

  applyFarEdgeFade(ctx, trackWin, trackBase, contentLength);
}

/**
 * A stable signature of which notes currently intersect the playhead, used
 * to scope the melody overlay's redraw to frames where that actually
 * changes (mawimbi#541 Goal 4) instead of unconditionally every frame
 * during playback — the previous behavior, since the playhead glow is the
 * overlay's only per-frame-varying input.
 */
function computeActiveNotesKey(
  notes: MelodyNote[],
  trackPlayheadTime: number,
): string {
  if (trackPlayheadTime < 0) return '';
  let key = '';
  for (const note of notes) {
    if (
      trackPlayheadTime >= note.startTime &&
      trackPlayheadTime < note.endTime
    ) {
      key += `${note.startTime}:${note.midiNote};`;
    }
  }
  return key;
}

function writeMelodyOverlay(
  canvas: HTMLCanvasElement,
  win: SharedCanvasWindow,
  held: TileFrameMeasurement,
  pixelsPerSecond: number,
  notes: MelodyNote[],
  color: TrackColor,
  frequencyBinCount: number,
  duration: number,
  startTime: number,
  playheadTime: number,
  lastDrawnOverlayRef: React.MutableRefObject<{
    offset: number;
    pps: number;
    noteCount: number;
    activeNotesKey: string;
  }>,
): void {
  const contentLength = duration * pixelsPerSecond;
  const trackWin = toTrackWindow(win, held.containerTop);
  positionCanvas(canvas, trackWin);
  const trackBase = getTrackBase(trackWin, contentLength);

  const needsResize =
    canvas.width !== trackWin.width || canvas.height !== trackWin.height;

  // Playhead time relative to this track's start time
  const trackPlayheadTime = playheadTime - startTime;
  const activeNotesKey = computeActiveNotesKey(notes, trackPlayheadTime);

  const last = lastDrawnOverlayRef.current;
  if (
    !needsResize &&
    trackBase === last.offset &&
    pixelsPerSecond === last.pps &&
    notes.length === last.noteCount &&
    activeNotesKey === last.activeNotesKey
  ) {
    return;
  }
  last.offset = trackBase;
  last.pps = pixelsPerSecond;
  last.noteCount = notes.length;
  last.activeNotesKey = activeNotesKey;

  if (needsResize) {
    canvas.width = trackWin.width;
    canvas.height = trackWin.height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  flipCanvasY(ctx, trackWin.height);

  const viewport: PianoRollViewport = {
    pixelsPerSecond,
    // The renderer draws note t at `t·pps − contentOffset` in flipped
    // coords; the canvas bottom sits at −trackBase in flipped track coords.
    contentOffset: -trackBase,
    viewportHeight: trackWin.height,
    canvasWidth: trackWin.width,
    frequencyBinCount,
    playheadTime: trackPlayheadTime,
  };

  drawPianoRoll(ctx, notes, color, viewport);

  ctx.restore();
}

export default Spectrogram;
