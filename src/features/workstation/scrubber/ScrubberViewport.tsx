import { type CSSProperties, type PropsWithChildren } from 'react';

type ScrubberViewportProps = PropsWithChildren<{
  style: CSSProperties;
  onClick: (e: React.MouseEvent) => void;
  onWheel: (e: React.WheelEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
}>;

/**
 * Perspective wrapper that positions and scales the scrubber to fit the
 * visible area above the bottom sheet.
 *
 * Sets the CSS `perspective` property for the 3D tilt effect and applies
 * `translateY`/`scaleY` when the drawer is open so the scrubber shrinks
 * to fit the reduced viewport — without touching the child tilt
 * container's own 3D transform.
 *
 * Also catches click, wheel, and touch events in the dead-zone corners
 * outside the tilted scroll container's trapezoid. Touch events are
 * translated into programmatic scroll on the tilt container, since the
 * 3D tilt transform breaks native touch scrolling on mobile devices.
 */
const ScrubberViewport = ({
  style,
  onClick,
  onWheel,
  onTouchStart,
  onTouchMove,
  children,
}: ScrubberViewportProps) => {
  return (
    <div
      className="scrubber__viewport"
      style={style}
      onClick={onClick}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
    >
      {children}
    </div>
  );
};

export default ScrubberViewport;
