import { type CSSProperties, forwardRef, type PropsWithChildren } from 'react';

type ScrubberTiltProps = PropsWithChildren<{
  style: CSSProperties;
  onClick: () => void;
  onScroll: () => void;
  onWheel: (e: React.WheelEvent) => void;
  onTouchMove: () => void;
}>;

/**
 * Scroll container that applies the 3D scrubber tilt.
 *
 * The inline transform tilts the timeline plane via `rotateX` around
 * the scrubber bottom and compensates for perspective foreshortening
 * with a `scaleY` factor so the far edge fills the viewport.
 *
 * Content scrolls vertically (inverted: time=0 at the bottom). Scroll
 * event handlers are provided by the parent Scrubber component.
 */
const ScrubberTilt = forwardRef<HTMLDivElement, ScrubberTiltProps>(
  ({ style, onClick, onScroll, onWheel, onTouchMove, children }, ref) => {
    return (
      <div
        ref={ref}
        className="scrubber__tilt"
        style={style}
        onClick={onClick}
        onScroll={onScroll}
        onWheel={onWheel}
        onTouchMove={onTouchMove}
      >
        {children}
      </div>
    );
  },
);

ScrubberTilt.displayName = 'ScrubberTilt';

export default ScrubberTilt;
