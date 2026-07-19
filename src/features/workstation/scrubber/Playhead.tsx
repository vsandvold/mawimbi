import {
  type CSSProperties,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import LoudnessMeterPlayhead from './LoudnessMeterPlayhead';

export type PlayheadHandle = {
  render: (frequencyData: Uint8Array | null, loudness: number) => void;
  renderIdle: () => void;
};

type PlayheadProps = {
  visibleHeight: number;
  /** Runway width at the playhead line as a fraction of the visible width,
      from the solved geometry — keeps the meter's edges on the runway
      rails (mawimbi#461). */
  meterWidthFraction: number;
};

/**
 * Playhead overlay that shows the current playback position.
 *
 * Renders a `LoudnessMeterPlayhead` canvas and keeps the canvas size
 * in sync with the container via ResizeObserver. Receives `visibleHeight`
 * (the same drawer-adjusted height useScrubberGeometry solves the runway
 * transform against) so the playhead's on-screen position and the 3D
 * geometry are always derived from one JS computation, rather than each
 * independently re-deriving "visible height" through a different
 * mechanism (this used to be a `calc(100% - drawer-height)` CSS
 * expression here, computed separately from the JS geometry).
 *
 * Exposes `render` and `renderIdle` via imperative handle so the
 * animation loop can drive the loudness meter visualization each frame.
 */
const Playhead = forwardRef<PlayheadHandle, PlayheadProps>(
  ({ visibleHeight, meterWidthFraction }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const meterRef =
      useRef<React.ComponentRef<typeof LoudnessMeterPlayhead>>(null);

    // Keep canvas size in sync with the playhead container
    useLayoutEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          meterRef.current?.resize(
            entry.contentRect.width,
            entry.contentRect.height,
          );
          // Redraw the idle playhead after the canvas size changes.
          // The initial renderIdle() call in the playing-sync effect fires
          // before the ResizeObserver has set the canvas size, so the
          // first frame is drawn into a zero-size canvas. Re-rendering
          // here ensures the playhead is visible as soon as layout resolves.
          // During playback the animation loop immediately overwrites this.
          meterRef.current?.renderIdle();
        }
      });
      observer.observe(el);

      return () => observer.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
      render(frequencyData: Uint8Array | null, loudness: number) {
        meterRef.current?.render(frequencyData, loudness);
      },
      renderIdle() {
        meterRef.current?.renderIdle();
      },
    }));

    // Re-draw the idle frame when the geometry-derived meter width changes
    // (opening the drawer re-solves the runway); during playback the
    // animation loop overwrites this on the next frame anyway.
    useLayoutEffect(() => {
      meterRef.current?.renderIdle();
    }, [meterWidthFraction]);

    const style: CSSProperties = {
      '--available-height': `${visibleHeight}px`,
    } as CSSProperties;

    return (
      <div ref={containerRef} className="scrubber__playhead" style={style}>
        <LoudnessMeterPlayhead
          ref={meterRef}
          width={0}
          height={0}
          meterWidthFraction={meterWidthFraction}
        />
      </div>
    );
  },
);

Playhead.displayName = 'Playhead';

export default Playhead;
