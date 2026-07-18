import { useSignals } from '@preact/signals-react/runtime';
import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../../shared/hooks/useMediaQuery';
import { activeRunwayConfig, type RunwayPreset } from './runwayConfig';
import {
  solveGeometry,
  type RunwayConfig,
  type RunwayGeometry,
} from './runwayProjection';
import { signals as tuningSignals } from './tuningSignals';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// Measured container height can be 0 (before the first ResizeObserver
// callback) or, in principle, smaller than drawerHeight — floor it so
// visibleHeight never goes to or past 0 and produces invalid CSS values.
const MIN_VISIBLE_HEIGHT_PX = 1;

const TRANSITION_PROPERTIES = [
  'transform',
  'transform-origin',
  'perspective',
  'perspective-origin',
];
const baseTransformStyle = {
  willChange: 'transform',
  transition: TRANSITION_PROPERTIES.map(
    (prop) => `${prop} 0.25s ease-out`,
  ).join(', '),
};

type ContainerSize = {
  width: number;
  height: number;
};

type ScrubberGeometry = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  viewportStyle: CSSProperties;
  tiltStyle: CSSProperties;
  geometry: RunwayGeometry;
  playheadFraction: number;
  visibleHeight: number;
  timelinePaddingTopPx: number;
  timelinePaddingBottomPx: number;
};

/**
 * Computes the 3D perspective geometry for the scrubber by delegating to
 * `runwayProjection.solveGeometry()` — this hook only measures the DOM and
 * maps the solved geometry onto CSS properties; it holds no geometry math
 * of its own.
 *
 * The visible box passed to the solver is the container's size minus the
 * open drawer's height. When the drawer opens or closes, geometry is
 * re-solved for the new visible box, so the runway's screen-space anchors
 * (playhead position, playhead width, horizon) stay true rather than being
 * patched with ad hoc compensating transforms.
 *
 * The base config is `activeRunwayConfig`, composed with the dev tuning
 * overlay's override signal when one is active (mawimbi#447) — a slider
 * tweak re-solves geometry the same way a drawer resize does, through this
 * one function, never by writing CSS directly. Subscribing to that signal
 * via `useSignals()` is the only reactive cost this hot-path hook takes on;
 * when the overlay has never been opened the override stays `null` and this
 * behaves exactly as before.
 *
 * `prefers-reduced-motion` flattens the tilt for regular playback, but not
 * while actively tuning — opening the overlay is an explicit request to see
 * the real 3D effect, which would otherwise make every slider look like a
 * no-op for a developer who happens to have that OS preference set.
 */
export function useScrubberGeometry(drawerHeight: number): ScrubberGeometry {
  useSignals();
  const containerRef = useRef<HTMLDivElement>(null);
  const containerSize = useContainerSize(containerRef);
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const configOverride = tuningSignals.configOverride.value;

  const visibleHeight = Math.max(
    containerSize.height - drawerHeight,
    MIN_VISIBLE_HEIGHT_PX,
  );
  const baseConfig = configOverride ?? activeRunwayConfig;
  const shouldFlattenForReducedMotion = prefersReducedMotion && !configOverride;
  const config = shouldFlattenForReducedMotion
    ? getFlatVariant(baseConfig)
    : baseConfig;
  const geometry = solveGeometry(config, {
    width: containerSize.width,
    height: visibleHeight,
  });
  const timelinePadding = getTimelinePadding(config, geometry, visibleHeight);

  return {
    containerRef,
    viewportStyle: getViewportStyle(
      geometry.perspectivePx,
      geometry.perspectiveOriginY,
    ),
    tiltStyle: getTiltStyle(geometry.rotateXDeg, geometry.transformOriginY),
    geometry,
    playheadFraction: baseConfig.playheadFraction,
    visibleHeight,
    timelinePaddingTopPx: timelinePadding.top,
    timelinePaddingBottomPx: timelinePadding.bottom,
  };
}

// A flat plane (tiltDeg 0) makes solveGeometry take its identity-geometry
// path — rotateX(0) disables the 3D effect without a separate code path.
function getFlatVariant(config: RunwayPreset): RunwayPreset {
  return { ...config, tiltDeg: 0 };
}

function getViewportStyle(
  perspectivePx: number,
  perspectiveOriginY: number,
): CSSProperties {
  return {
    ...baseTransformStyle,
    perspective: `${perspectivePx}px`,
    perspectiveOrigin: `center ${perspectiveOriginY}px`,
  };
}

function getTiltStyle(
  rotateXDeg: number,
  transformOriginY: number,
): CSSProperties {
  return {
    ...baseTransformStyle,
    transformOrigin: `center ${transformOriginY}px`,
    transform: `rotateX(${rotateXDeg}deg)`,
  };
}

type TimelinePadding = {
  top: number;
  bottom: number;
};

/**
 * Computes the `.timeline` padding (in px, pre-transform layout space) that
 * keeps scrolled content aligned with the runway's screen-space anchors.
 *
 * The projection is nonlinear, so content laid out at plane-space distance
 * `playheadFraction × visibleHeight` from the origin does NOT project onto
 * the playhead line — only content at distance `sPlayhead` does. Padding
 * must be sized so that when scrolled to time 0 (`scrollTop = maxScrollTop`,
 * inverted scroll — see useScrubberScroll.ts), the boundary between actual
 * audio content and this padding sits at the plane-space distance the
 * geometry solver actually anchored to the playhead line.
 *
 * `sPlayhead` is recovered from `geometry.farEdgeS - config.runwayLengthPx`
 * (farEdgeS already equals `sPlayhead + runwayLengthPx`, computed once by
 * the solver) rather than re-derived via the inverse projection — same
 * value, no repeated trig.
 *
 * Scroll position is driven by the (untransformed) PhantomScroller, whose
 * clientHeight already equals `visibleHeight` (it shrinks with the drawer
 * via its own CSS). Given that, the local Y (within the tilt container,
 * relative to its own — undiminished — box) of content scrolled to time 0
 * works out to `visibleHeight - paddingBottom`, independent of paddingTop.
 * Setting that equal to the playhead's own local Y (`transformOriginY -
 * sPlayhead`) and solving gives the formula below.
 *
 * `paddingTop` has no equally strict constraint from this invariant — it
 * only needs to provide enough scrollable space to see `runwayLengthPx` of
 * upcoming content, which is what it's set to directly. `runwayLengthPx` is
 * a pre-transform (flat) distance, not tied to any screen-space anchor, so
 * how far scrolled-to-the-top content actually reaches toward the horizon
 * is visual/preset work, not a geometry-correctness concern this function
 * owns.
 */
function getTimelinePadding(
  config: RunwayConfig,
  geometry: RunwayGeometry,
  visibleHeight: number,
): TimelinePadding {
  const sPlayhead = geometry.farEdgeS - config.runwayLengthPx;
  const playheadLocalY = geometry.transformOriginY - sPlayhead;

  return {
    top: config.runwayLengthPx,
    bottom: visibleHeight - playheadLocalY,
  };
}

/** Tracks the scrubber tilt container's size via ResizeObserver. */
function useContainerSize(
  containerRef: React.RefObject<HTMLDivElement | null>,
): ContainerSize {
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    };
    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(el);

    return () => observer.disconnect();
    // containerRef is a stable ref object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return size;
}
