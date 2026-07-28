// SPIKE (mawimbi#593) — the String mode ribbon stack.
//
// Mounted **outside `ScrubberTilt`** (spec 009 Decision 5): under the
// runway's `rotateX(70deg)` a horizontal line projects to a trapezoid chord
// whose width depends on its depth, so a ribbon rendered inside the tilt
// would have its ends somewhere other than the viewport edges, at a width
// that varies per track. "Pinned at both ends of the viewport" and the
// perspective are incompatible; at the Now scale the ribbon cannot live
// inside the runway.
//
// It sits before the `PhantomScroller` in DOM order and is
// `pointer-events: none`, so tap-to-toggle-playback, scrubbing, the
// playhead meter and the zoom controls all keep working unchanged while
// the ribbons cover the runway.
//
// **No `useState` in the per-frame path.** Every changing value reaches the
// draw through refs and the shared render loop (CLAUDE.md's #114-class
// rule); the derivation itself lives in `RibbonSources`, a plain memoizing
// class with no React in it, following `features/rhythm/anchorBeatTimes.ts`.

import { useEffect, useRef } from 'react';
import { useAudioService } from '../audio/useAudioService';
import { usePlaybackService } from '../playback/usePlaybackService';
import { useTrackService } from '../tracks/useTrackService';
import { useEditMode } from '../workstation/useEditMode';
import { timelineRenderLoop } from '../spectrogram/TimelineRenderLoop';
import { type Track } from '../tracks/types';
import { getEnvelopes, getEnvelopeVersion } from './envelopeStore';
import RibbonSources, { type RibbonTrackDescriptor } from './RibbonSources';
import { drawRibbons } from './ribbonRenderer';
import { getStringParams, getStringParamsVersion } from './stringSignals';
import StringHud from './StringHud';
import { useStringEnvelopes } from './useStringEnvelopes';
import './StringMode.css';

type StringModeProps = { tracks: Track[]; drawerHeight: number };

type LastDrawn = {
  time: number;
  paramsVersion: number;
  envelopeVersion: number;
  descriptorKey: string;
  width: number;
  height: number;
};

const StringMode = ({ tracks, drawerHeight }: StringModeProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLPreElement>(null);

  const audioService = useAudioService();
  const playback = usePlaybackService();
  const trackService = useTrackService();
  const { activeEditTrackId } = useEditMode();

  useStringEnvelopes(tracks);

  const descriptors: RibbonTrackDescriptor[] = tracks.map((track) => {
    const audioBuffer = trackService.retrieveAudioBuffer(track.trackId);
    return {
      trackId: track.trackId,
      color: track.color,
      startTime: trackService.retrieveStartTime(track.trackId) ?? 0,
      duration: audioBuffer?.duration ?? 0,
      // Edit mode's focus/dim semantics, reused rather than reinvented — a
      // user who learned it on the runway does not learn it twice
      // (spec 009 Decision 5).
      isDimmed:
        activeEditTrackId !== null && activeEditTrackId !== track.trackId,
    };
  });

  const latestRef = useRef(descriptors);
  latestRef.current = descriptors;

  const sourcesRef = useRef<RibbonSources | null>(null);
  if (!sourcesRef.current) {
    sourcesRef.current = new RibbonSources({
      getMelody: (trackId) => audioService.spectrogramCache.getMelody(trackId),
      getRhythm: (trackId) => audioService.spectrogramCache.getRhythm(trackId),
      getEnvelopes,
    });
  }

  const lastDrawnRef = useRef<LastDrawn>({
    time: Number.NaN,
    paramsVersion: -1,
    envelopeVersion: -1,
    descriptorKey: '',
    width: -1,
    height: -1,
  });
  const hasPaintedRef = useRef(false);
  const frameClockRef = useRef({ last: 0, fps: 0, drawMs: 0 });
  // A container resize is a dirty signal `peekDirty` cannot derive from its
  // own inputs — none of the engine time, params, envelopes or track list
  // changes when the drawer opens or the device rotates, so a resize while
  // stopped left a stale backing store stretched over the new box with no
  // frame scheduled to fix it (`/code-review` on PR #594). Observed rather
  // than measured in `peekDirty`, which runs on every idle frame and must
  // not force layout.
  const resizedRef = useRef(true);

  useEffect(() => {
    // The shared `SharedCanvasWindow` is the *runway's* pre-transform local-Y
    // span, which is several times the viewport height (it has to be — the
    // tilt projects content from far above the box back down into view). The
    // ribbon stack lives outside the tilt and fills its own box, so sizing
    // its backing store from `win.height` would squash every ribbon by that
    // ratio. This is the one DOM read the shared window cannot hoist.
    const measurement = { width: 0, height: 0 };

    return timelineRenderLoop.register({
      peekDirty: () => {
        // Mirrors `write`'s only early return exactly. Every other state
        // `write` handles updates the sentinels below, so this callback can
        // never report dirty forever — which would hold the *whole* shared
        // loop out of its idle short-circuit and make every mounted track
        // pay, not just this canvas (`RhythmOverlay.tsx`;
        // `e2e/spectrogram-render-loop.spec.ts` caught this class on CI).
        if (latestRef.current.length === 0 && !hasPaintedRef.current) {
          return false;
        }
        const last = lastDrawnRef.current;
        return (
          resizedRef.current ||
          playback.getEngineTime() !== last.time ||
          getStringParamsVersion() !== last.paramsVersion ||
          getEnvelopeVersion() !== last.envelopeVersion ||
          describeTracks(latestRef.current) !== last.descriptorKey
        );
      },
      measure: () => {
        const container = containerRef.current;
        if (!container) return;
        measurement.width = container.clientWidth;
        measurement.height = container.clientHeight;
      },
      write: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const descriptorList = latestRef.current;
        const params = getStringParams();

        // Sentinels advance before any early return, so `peekDirty` and
        // `write` cannot disagree about what has been handled.
        const last = lastDrawnRef.current;
        last.time = playback.getEngineTime();
        last.paramsVersion = getStringParamsVersion();
        last.envelopeVersion = getEnvelopeVersion();
        last.descriptorKey = describeTracks(descriptorList);

        const ribbons = sourcesRef.current!.build(descriptorList, params);
        if (ribbons.length === 0 && !hasPaintedRef.current) return;

        const { width, height } = measurement;
        if (width === 0 || height === 0) return;
        // Cleared only once the new box has actually been drawn at.
        resizedRef.current = false;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          last.width = width;
          last.height = height;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);

        const startedAt = performance.now();
        const stats = drawRibbons(ctx, ribbons, last.time, params, {
          width,
          height,
        });
        const drawMs = performance.now() - startedAt;
        hasPaintedRef.current = ribbons.length > 0;

        updateHud(
          hudRef.current,
          frameClockRef.current,
          stats.fills,
          ribbons.length,
          drawMs,
        );
      },
    });
    // Latest values are read from refs; the registration stays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      resizedRef.current = true;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="string-mode"
      // Same drawer-adjusted visible box every other `inset: 0` overlay in
      // the scrubber shrinks to, so the ribbons can't run under the toolbar
      // dock or an open sheet.
      style={drawerHeight > 0 ? { bottom: `${drawerHeight}px` } : undefined}
    >
      <canvas ref={canvasRef} className="string-mode__canvas" />
      <StringHud hudRef={hudRef} />
    </div>
  );
};

/**
 * A stable string identity for the track list — cheap enough to build in
 * `peekDirty`, which runs on every idle frame.
 */
function describeTracks(descriptors: readonly RibbonTrackDescriptor[]): string {
  let key = '';
  for (const descriptor of descriptors) {
    key += `${descriptor.trackId}:${descriptor.startTime}:${descriptor.isDimmed ? 1 : 0}|`;
  }
  return key;
}

/**
 * `fps`, `fills/frame` and the draw's own wall time, written straight to
 * the DOM.
 *
 * Fill count is the metric spike question 6 needs: it is what actually
 * varies as the parameters are swept (the cross-section toggle alone moves
 * it 8×), whereas the cost per fill barely moves. The calibration worth
 * remembering is that the radial-wave-field prototype runs ~1,056
 * fills/frame and is marginal at its own defaults.
 *
 * `ms` is here because `fps` alone cannot answer the budget question in a
 * loaded sandbox — measured frame gaps run ~90 ms here regardless of what
 * is drawn (#571), so the frame rate says more about the machine than
 * about this view. The draw's own elapsed time is the figure to compare
 * against spec 009's ~4–6 ms estimate.
 */
function updateHud(
  element: HTMLPreElement | null,
  clock: { last: number; fps: number; drawMs: number },
  fills: number,
  ribbonCount: number,
  drawMs: number,
): void {
  if (!element) return;
  const now = performance.now();
  if (clock.last > 0) {
    const gap = now - clock.last;
    if (gap > 0) {
      const instant = 1000 / gap;
      clock.fps = clock.fps === 0 ? instant : clock.fps * 0.9 + instant * 0.1;
    }
  }
  clock.last = now;
  clock.drawMs =
    clock.drawMs === 0 ? drawMs : clock.drawMs * 0.9 + drawMs * 0.1;
  element.textContent =
    `${clock.fps.toFixed(0)} fps · ${clock.drawMs.toFixed(1)} ms · ` +
    `${fills} fills · ${ribbonCount} ribbons`;
}

export default StringMode;
