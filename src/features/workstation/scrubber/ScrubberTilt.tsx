import {
  type CSSProperties,
  forwardRef,
  type PropsWithChildren,
  type Ref,
} from 'react';

type ScrubberTiltProps = PropsWithChildren<{
  style: CSSProperties;
  offsetRef: Ref<HTMLDivElement>;
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
 * This container is purely visual — it does not scroll, clip, or handle
 * pointer events. Scroll interaction is handled by the PhantomScroller
 * overlay; useScrubberScroll applies its scroll position as a translateY
 * on the offset stage rendered here. Making the tilt itself a scroll
 * container would clip the runway in pre-transform space (mawimbi#459)
 * and clamp its scroll range short of the phantom's (mawimbi#450).
 */
const ScrubberTilt = forwardRef<HTMLDivElement, ScrubberTiltProps>(
  ({ style, offsetRef, children }, ref) => {
    return (
      <div ref={ref} className="scrubber__tilt" style={style}>
        <div ref={offsetRef} className="scrubber__offset">
          {children}
        </div>
      </div>
    );
  },
);

ScrubberTilt.displayName = 'ScrubberTilt';

export default ScrubberTilt;
