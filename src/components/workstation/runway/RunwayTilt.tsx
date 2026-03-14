import { type CSSProperties, forwardRef, type PropsWithChildren } from 'react';

type RunwayTiltProps = PropsWithChildren<{
  style: CSSProperties;
  onClick: () => void;
  onScroll: () => void;
  onWheel: (e: React.WheelEvent) => void;
  onTouchMove: () => void;
}>;

/**
 * Scroll container that applies the 3D runway tilt.
 *
 * The inline transform tilts the timeline plane via `rotateX` around
 * the runway bottom and compensates for perspective foreshortening
 * with a `scaleY` factor so the far edge fills the viewport.
 *
 * Content scrolls vertically (inverted: time=0 at the bottom). Scroll
 * event handlers are provided by the parent Runway component.
 */
const RunwayTilt = forwardRef<HTMLDivElement, RunwayTiltProps>(
  ({ style, onClick, onScroll, onWheel, onTouchMove, children }, ref) => {
    return (
      <div
        ref={ref}
        className="runway__tilt"
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

RunwayTilt.displayName = 'RunwayTilt';

export default RunwayTilt;
