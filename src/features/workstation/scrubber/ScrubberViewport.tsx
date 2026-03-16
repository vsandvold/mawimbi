import { type CSSProperties, type PropsWithChildren } from 'react';

type ScrubberViewportProps = PropsWithChildren<{
  style: CSSProperties;
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
