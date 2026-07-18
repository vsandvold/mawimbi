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

const FOG_GRADIENT_DIRECTION = 'to bottom';
const SHADE_COLOR_CSS_VAR = '--shade-color';
const FRACTION_TO_PERCENT = 100;

// No fog on a flat plane — atmospheric depth cueing has nothing to sell
// without perspective. Checking the solved rotateXDeg (rather than relying
// on the flat branch's horizonY landing far outside the gradient's 0-100%
// range) makes "no fog when flat" a declared outcome instead of an
// incidental side effect of solveFlatGeometry's internal constants.
const FLAT_ROTATE_X_DEG = 0;
const NO_FOG_STYLE: CSSProperties = { backgroundImage: 'none' };

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
  fogStyle: CSSProperties;
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
  const config = prefersReducedMotion ? getFlatVariant(baseConfig) : baseConfig;
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
    fogStyle: getFogStyle(config, geometry, visibleHeight),
    geometry,
    playheadFraction: baseConfig.playheadFraction,
    visibleHeight,
    timelinePaddingTopPx: timelinePadding.top,
    timelinePaddingBottomPx: timelinePadding.bottom,
  };
}

// A flat plane (tiltDeg 0) makes solveGeometry take its identity-geometry
// path — rotateX(0) disables the 3D effect without a separate code path.
// getFogStyle's own FLAT_ROTATE_X_DEG check disables the fog the same way,
// so this doesn't need its own fogStartFraction override.
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

/**
 * Computes the atmospheric fog overlay as a gradient anchored to the
 * solved `horizonY` and playhead position, expressed as percentages of the
 * visible box (the fog overlay's own rendered height always equals
 * `visibleHeight` — see `getFogOverlayStyle` in Scrubber.tsx, which shrinks
 * it to match the drawer-adjusted area the same way `visibleHeight` itself
 * is derived). Because those percentages are recomputed from the solved
 * geometry on every call, the fog band tracks wherever the horizon actually
 * lands (which shifts with tilt, elevation, and the drawer) instead of
 * drifting the way the pre-#410 gradient — hardcoded to fixed percentages
 * regardless of geometry — did.
 *
 * `fogStartFraction` is where the fade begins, measured as a fraction of
 * the playhead→horizon distance starting from the playhead (0 = fog starts
 * right at the playhead, covering the whole runway; 1 = fog collapses to
 * the horizon line itself, i.e. no visible fog). The fade band's actual
 * on-screen width is therefore the remaining `(1 - fogStartFraction)` of
 * that distance, ending at the horizon.
 */
function getFogStyle(
  config: RunwayPreset,
  geometry: RunwayGeometry,
  visibleHeight: number,
): CSSProperties {
  if (geometry.rotateXDeg === FLAT_ROTATE_X_DEG) return NO_FOG_STYLE;

  const playheadPercent = config.playheadFraction * FRACTION_TO_PERCENT;
  const horizonPercent =
    (geometry.horizonY / visibleHeight) * FRACTION_TO_PERCENT;
  const fogStartPercent =
    playheadPercent -
    config.fogStartFraction * (playheadPercent - horizonPercent);

  return {
    backgroundImage: `linear-gradient(${FOG_GRADIENT_DIRECTION}, rgb(var(${SHADE_COLOR_CSS_VAR})) ${horizonPercent}%, rgba(var(${SHADE_COLOR_CSS_VAR}), 0) ${fogStartPercent}%)`,
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
 * a pre-transform (flat) distance, not tied to where the fog gradient
 * starts on screen (`fogStartFraction`, a fraction of the solved,
 * screen-space playhead→horizon distance) — the two aren't currently
 * calibrated to align, so scrolled-to-the-top content can end well short of
 * (or past) the fog band rather than fading into it. Tuning that alignment
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
