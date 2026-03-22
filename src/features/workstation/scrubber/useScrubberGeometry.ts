import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';

// The scrubber bottom sits at this fraction from the top of the visible area
// (viewport minus drawer). 0.75 = bottom 25% of visible area is empty.
const SCRUBBER_BOTTOM_FRACTION = 0.75;

// Fallbacks if CSS custom properties are missing or unparseable
const FALLBACK_PERSPECTIVE = 500;
const FALLBACK_TILT = 75;

const baseTransformStyle = {
  willChange: 'transform',
  transition: 'transform 0.25s ease-out',
};

type ScrubberGeometry = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  viewportStyle: CSSProperties;
  tiltStyle: CSSProperties;
};

/**
 * Computes the 3D perspective geometry for the scrubber.
 *
 * Tracks the scroll container's height via ResizeObserver and derives:
 * - `viewportStyle` — perspective-origin + drawer-aware translateY/scaleY
 * - `tiltStyle` — rotateX tilt + foreshortening-compensating scaleY
 *
 * The container height is measured from the scroll container (ScrubberTilt),
 * not the viewport wrapper. This keeps the 3D transform stable when the
 * bottom sheet opens — only the viewport wrapper scales/repositions.
 */
export function useScrubberGeometry(drawerHeight: number): ScrubberGeometry {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => setContainerHeight(el.offsetHeight);
    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // Using the full height (not visible height) keeps the perspective geometry
  // stable when the bottom sheet opens — the 3D transform and scaleY
  // compensation stay constant, preventing the timeline from appearing wider.
  const scrubberBottomY = SCRUBBER_BOTTOM_FRACTION * containerHeight;
  const extendFactor = computeExtendFactor(scrubberBottomY);

  const viewportStyle = getViewportStyle(
    scrubberBottomY,
    drawerHeight,
    containerHeight,
  );
  const tiltStyle = getTiltStyle(extendFactor, scrubberBottomY);

  return { containerRef, viewportStyle, tiltStyle };
}

/**
 * Compensate for perspective foreshortening so the far edge (top) fills
 * the viewport. `scrubberBottomY` is the distance from the top of the
 * container to the tilt origin — content above the origin is the visible
 * scrubber that needs to fill the viewport width after foreshortening.
 */
function computeExtendFactor(scrubberBottomY: number): number {
  if (scrubberBottomY <= 0) return 1;

  const tiltRad = (FALLBACK_TILT * Math.PI) / 180;
  const depth = scrubberBottomY * Math.sin(tiltRad);
  const projectionRatio = FALLBACK_PERSPECTIVE / (FALLBACK_PERSPECTIVE + depth);
  return 1 / projectionRatio;
}

/**
 * Style for the viewport wrapper. Places `perspective-origin` at the
 * scrubber bottom so the vanishing point matches the tilt pivot.
 *
 * When the drawer is open, `translateY` and `scaleY` reposition and shrink
 * the scrubber to fit the visible area above the drawer — without touching
 * the child tilt container's own 3D transform or styling.
 */
function getViewportStyle(
  scrubberBottomY: number,
  drawerHeight: number,
  containerHeight: number,
): CSSProperties {
  const hasDrawer = drawerHeight > 0 && containerHeight > 0;
  const scaleY = hasDrawer ? 0.5 : 1;

  return {
    perspectiveOrigin: `center ${scrubberBottomY}px`,
    ...baseTransformStyle,
    transform: `translateY(-100px) scaleY(${scaleY})`,
  };
}

/**
 * Style for the tilt container. The transform tilts the timeline into a
 * dramatic scrubber perspective:
 * - rotateX tilts the plane around the scrubber bottom
 * - scaleY(extendFactor) compensates for perspective foreshortening so the
 *   far edge (top) fills the viewport regardless of screen size
 * - transformOrigin is placed at the scrubber bottom so the tilt pivots there
 */
function getTiltStyle(
  extendFactor: number,
  scrubberBottomY: number,
): CSSProperties {
  return {
    ...baseTransformStyle,
    transformOrigin: `center ${scrubberBottomY}px`,
    transform: `rotateX(var(--timeline-tilt, 0deg)) scaleY(${extendFactor})`,
  };
}
