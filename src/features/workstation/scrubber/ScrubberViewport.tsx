import { type CSSProperties, type PropsWithChildren } from 'react';

type ScrubberViewportProps = PropsWithChildren<{
  style: CSSProperties;
}>;

/**
 * Perspective wrapper for the 3D tilt.
 *
 * Sets the CSS `perspective` and `perspective-origin` solved by
 * `runwayProjection.solveGeometry()` for the current visible area
 * (container minus drawer height) — geometry re-solves when the drawer
 * opens or closes, so no separate drawer-compensating transform is needed
 * here.
 *
 * This container is purely visual — pointer events pass through to the
 * PhantomScroller overlay behind it.
 */
const ScrubberViewport = ({ style, children }: ScrubberViewportProps) => {
  return (
    <div className="scrubber__viewport" style={style}>
      {children}
    </div>
  );
};

export default ScrubberViewport;
