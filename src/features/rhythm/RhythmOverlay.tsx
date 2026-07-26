// RhythmOverlay — the project-level canvas the beat rungs draw on (spec 008
// Decision 2, milestone 3).
//
// One canvas, not one per track: the induced pulse is a property of the
// combined stream, so it has one owner. Drawing the rungs inside the anchor
// track's own canvas would make them dim whenever another track is focused
// — stream-level state dimming with a source, which is the wrong semantics
// (the per-track *onset* marks, milestone 4, want exactly that inheritance
// and therefore do live in each track's own draw).
//
// It mounts as a zero-height grid item in the same cell as the
// `.timeline__track` items so it shares their `align-items: end` bottom
// edge — the position of project time 0 in scroll-content coordinates.
// That gives the rungs the tracks' own reference point by construction
// rather than by a second, separately-derived calculation.

import { useEffect, useRef } from 'react';
import {
  getContentOffsetTop,
  timelineRenderLoop,
} from '../spectrogram/TimelineRenderLoop';
import { type Track } from '../tracks/types';
import {
  EMPTY_BEAT_GRID,
  drawBeatRungs,
  drawPhantomRungs,
  type BeatGrid,
} from './rhythmOverlayRenderer';
import { useRhythmAnchor } from './useRhythmAnchor';
import './RhythmOverlay.css';

type RhythmOverlayProps = {
  pixelsPerSecond: number;
  tracks: Track[];
};

type LastDrawn = {
  timeZeroY: number;
  pps: number;
  grid: BeatGrid | null;
  startTime: number;
};

const RhythmOverlay = ({ pixelsPerSecond, tracks }: RhythmOverlayProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const anchor = useRhythmAnchor(tracks);
  // `EMPTY_BEAT_GRID` is a shared constant, so "no anchor" holds one stable
  // identity and `peekDirty` settles on it instead of reporting a change
  // every frame while nothing is rendered.
  const grid = anchor?.grid ?? EMPTY_BEAT_GRID;
  const startTime = anchor?.startTime ?? 0;

  const latestRef = useRef({ pixelsPerSecond, grid, startTime });
  latestRef.current = { pixelsPerSecond, grid, startTime };

  const lastDrawnRef = useRef<LastDrawn>({
    timeZeroY: Number.NaN,
    pps: Number.NaN,
    grid: null,
    startTime: Number.NaN,
  });
  // Whether the last write actually put rungs on the canvas — the one bit
  // that says whether there is anything to erase.
  const hasPaintedRef = useRef(false);

  useEffect(() => {
    const measurement = { containerTop: 0 };

    // A plain measure-then-write callback. The recording track's
    // write-inside-measure exception (`Spectrogram.tsx`) explicitly does
    // *not* apply: this container's height is a fixed zero, so nothing it
    // writes can move what it reads.
    return timelineRenderLoop.register({
      peekDirty: () => {
        const last = lastDrawnRef.current;
        const { grid, pixelsPerSecond, startTime } = latestRef.current;
        // Nothing on the canvas and nothing to put there: never dirty. This
        // has to match `write`'s own early return exactly, because the
        // comparisons below are against sentinels that only `write` clears
        // — so any state `write` declines to handle would report a change
        // on every frame forever, holding the *whole* loop out of its idle
        // short-circuit (every mounted track pays, not just this canvas).
        // A project with no confident anchor did exactly that
        // (`e2e/spectrogram-render-loop.spec.ts`); same trap the
        // zero-melody-note comment in `Spectrogram.tsx` documents.
        if (grid.times.length === 0 && !hasPaintedRef.current) return false;
        return (
          grid !== last.grid ||
          pixelsPerSecond !== last.pps ||
          startTime !== last.startTime
        );
      },
      measure: () => {
        const container = containerRef.current;
        if (!container) return;
        measurement.containerTop = getContentOffsetTop(container);
      },
      write: (win) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const { grid, pixelsPerSecond, startTime } = latestRef.current;
        // A project with no rhythm data (or no confident anchor) costs
        // this overlay nothing per frame: no transform write, no resize,
        // no clear. Scroll marks every frame dirty for the loop as a
        // whole, so without this the empty overlay would run a full-window
        // `clearRect` on every scrolled frame for a canvas that has never
        // had anything on it. An empty grid can carry no phantom rungs
        // either — `extrapolateTicks` needs points to continue from — so
        // `times` alone still decides this, and `peekDirty` still matches.
        if (grid.times.length === 0 && !hasPaintedRef.current) return;

        // The canvas is laid out at its container's top edge; translating
        // it by the window's offset keeps it covering the runway's canvas
        // window while the offset stage moves the surrounding content
        // (`Spectrogram.tsx`'s `positionCanvas`, same mechanism).
        const timeZeroY = measurement.containerTop - win.contentTop;
        const transform = `translateY(${-timeZeroY}px)`;
        if (canvas.style.transform !== transform) {
          canvas.style.transform = transform;
        }

        const needsResize =
          canvas.width !== win.width || canvas.height !== win.height;

        const last = lastDrawnRef.current;
        if (
          !needsResize &&
          timeZeroY === last.timeZeroY &&
          pixelsPerSecond === last.pps &&
          grid === last.grid &&
          startTime === last.startTime
        ) {
          return;
        }
        // Compared by reference, like the tiles check `Spectrogram.tsx`
        // uses (kb/verification.md, #494): `useRhythmAnchor` memoizes a
        // fresh grid object for every distinct set of ticks, so identity
        // alone distinguishes a genuinely new grid from an unrelated
        // re-render — and a grid that regenerates to the *same* times (a
        // re-analysis landing on the same beats) would be a no-op redraw
        // either way.
        last.timeZeroY = timeZeroY;
        last.pps = pixelsPerSecond;
        last.grid = grid;
        last.startTime = startTime;

        if (needsResize) {
          canvas.width = win.width;
          canvas.height = win.height;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const viewport = {
          timeZeroY,
          pixelsPerSecond,
          canvasWidth: win.width,
          canvasHeight: win.height,
        };
        drawBeatRungs(ctx, grid, startTime, viewport);
        // The ghosted continuation past the last tracked beat (spec Goal 5,
        // #572) — drawn after the detection-backed rungs, which is where
        // deleting this one line turns the cuttable milestone off.
        drawPhantomRungs(ctx, grid, startTime, viewport);
        hasPaintedRef.current = grid.times.length > 0;
      },
    });
    // Latest values are read from latestRef; the registration itself must
    // stay stable across renders.
  }, []);

  return (
    <div ref={containerRef} className="timeline__rhythm">
      <canvas ref={canvasRef} className="timeline__rhythm-canvas" />
    </div>
  );
};

export default RhythmOverlay;
