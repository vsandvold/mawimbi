import { type CSSProperties, forwardRef, type PropsWithChildren } from 'react';

type PhantomScrollerProps = PropsWithChildren<{
  spacerHeight: number;
  style?: CSSProperties;
  onClick: () => void;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onScroll: () => void;
  onWheel: (e: React.WheelEvent) => void;
}>;

/**
 * Invisible scroll overlay that captures all scroll interactions.
 *
 * The phantom scroller sits on top of the 3D-transformed timeline,
 * providing a full untransformed rectangle for native scroll physics
 * (wheel, touch, momentum). A spacer div sets the scrollable height
 * to match the timeline content, and scroll position is synced to the
 * visual content via a translateY wrapper inside the tilt container.
 *
 * This eliminates the trapezoidal hit-test area that the tilted scroll
 * container had, enabling reliable touch scrolling on mobile.
 */
const PhantomScroller = forwardRef<HTMLDivElement, PhantomScrollerProps>(
  (
    {
      spacerHeight,
      style,
      onClick,
      onPointerDown,
      onPointerUp,
      onScroll,
      onWheel,
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className="scrubber__phantom"
        style={style}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onScroll={onScroll}
        onWheel={onWheel}
      >
        <div style={{ height: spacerHeight }} />
      </div>
    );
  },
);

PhantomScroller.displayName = 'PhantomScroller';

export default PhantomScroller;
