import { type CSSProperties, forwardRef, type PropsWithChildren } from 'react';

type ScrubberTiltProps = PropsWithChildren<{
  style: CSSProperties;
}>;

/**
 * Visual container that applies the 3D scrubber tilt.
 *
 * The inline transform tilts the timeline plane via `rotateX`, pivoting at
 * the transform-origin solved by `runwayProjection.solveGeometry()`. The
 * far edge is filled by content extent (runway length + timeline padding),
 * not by scaling the plane — the rendered tilt always matches the
 * configured tilt.
 *
 * This container is purely visual — it does not scroll or handle
 * pointer events. Scroll interaction is handled by the PhantomScroller
 * overlay, which syncs scroll position to a translateY wrapper inside
 * this container.
 */
const ScrubberTilt = forwardRef<HTMLDivElement, ScrubberTiltProps>(
  ({ style, children }, ref) => {
    return (
      <div ref={ref} className="scrubber__tilt" style={style}>
        {children}
      </div>
    );
  },
);

ScrubberTilt.displayName = 'ScrubberTilt';

export default ScrubberTilt;
