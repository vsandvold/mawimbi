import { type CSSProperties, forwardRef, type PropsWithChildren } from 'react';

type ScrubberTiltProps = PropsWithChildren<{
  style: CSSProperties;
}>;

/**
 * Visual container that applies the 3D scrubber tilt.
 *
 * The inline transform tilts the timeline plane via `rotateX` around
 * the scrubber bottom and compensates for perspective foreshortening
 * with a `scaleY` factor so the far edge fills the viewport.
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
