import { type CSSProperties, type PropsWithChildren } from 'react';

type ScrubberViewportProps = PropsWithChildren<{
  style: CSSProperties;
  onClick: (e: React.MouseEvent) => void;
  onWheel: (e: React.WheelEvent) => void;
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
 * Also catches click and wheel events in the dead-zone corners outside
 * the tilted scroll container's trapezoid.
 */
const ScrubberViewport = ({
  style,
  onClick,
  onWheel,
  children,
}: ScrubberViewportProps) => {
  return (
    <div
      className="scrubber__viewport"
      style={style}
      onClick={onClick}
      onWheel={onWheel}
    >
      {children}
    </div>
  );
};

export default ScrubberViewport;
