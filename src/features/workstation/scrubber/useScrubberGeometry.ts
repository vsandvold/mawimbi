import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { activeRunwayConfig } from './runwayConfig';
import {
  screenYToPlane,
  solveGeometry,
  type RunwayConfig,
  type RunwayGeometry,
} from './runwayProjection';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const baseTransformStyle = {
  willChange: 'transform',
  transition: 'transform 0.25s ease-out',
};

type ContainerSize = {
  width: number;
  height: number;
};

type ScrubberGeometry = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  viewportStyle: CSSProperties;
  tiltStyle: CSSProperties;
  playheadFraction: number;
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
 */
export function useScrubberGeometry(drawerHeight: number): ScrubberGeometry {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerSize = useContainerSize(containerRef);
  const prefersReducedMotion = usePrefersReducedMotion();

  const visibleHeight = containerSize.height - drawerHeight;
  const config = getEffectiveConfig(prefersReducedMotion);
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
    playheadFraction: activeRunwayConfig.playheadFraction,
    timelinePaddingTopPx: timelinePadding.top,
    timelinePaddingBottomPx: timelinePadding.bottom,
  };
}

function getEffectiveConfig(prefersReducedMotion: boolean): RunwayConfig {
  if (!prefersReducedMotion) return activeRunwayConfig;
  // A flat plane (tiltDeg 0) makes solveGeometry take its identity-geometry
  // path — rotateX(0) disables the 3D effect without a separate code path.
  return { ...activeRunwayConfig, tiltDeg: 0 };
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
 * geometry solver actually anchored to the playhead line, found via the
 * inverse projection (`screenYToPlane`).
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
 * upcoming content before the far edge/fog, which is what it's set to
 * directly (fog placement itself lands in a later issue).
 */
function getTimelinePadding(
  config: RunwayConfig,
  geometry: RunwayGeometry,
  visibleHeight: number,
): TimelinePadding {
  const playheadScreenY = config.playheadFraction * visibleHeight;
  const sPlayhead = screenYToPlane(playheadScreenY, geometry);
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

    const update = () =>
      setSize({ width: el.offsetWidth, height: el.offsetHeight });
    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(el);

    return () => observer.disconnect();
    // containerRef is a stable ref object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return size;
}

/** Tracks the `prefers-reduced-motion` media query, live. */
function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );

  useLayoutEffect(() => {
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handler = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
}
