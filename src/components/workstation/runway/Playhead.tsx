import {
  type CSSProperties,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import PlasmaPlayhead from './PlasmaPlayhead';

export type PlayheadHandle = {
  render: (frequencyData: Uint8Array | null, loudness: number) => void;
  renderIdle: () => void;
};

type PlayheadProps = {
  drawerHeight: number;
};

/**
 * Playhead overlay that shows the current playback position.
 *
 * Renders a `PlasmaPlayhead` canvas and keeps the canvas width in
 * sync with the container via ResizeObserver. Receives `drawerHeight`
 * to offset the playhead position within the visible area above the
 * bottom sheet.
 *
 * Exposes `render` and `renderIdle` via imperative handle so the
 * animation loop can drive the plasma visualization each frame.
 */
const Playhead = forwardRef<PlayheadHandle, PlayheadProps>(
  ({ drawerHeight }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const plasmaRef = useRef<React.ComponentRef<typeof PlasmaPlayhead>>(null);

    // Keep plasma canvas width in sync with the playhead container
    useLayoutEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          plasmaRef.current?.resize(entry.contentRect.width);
          // Redraw the idle playhead after the canvas width changes.
          // The initial renderIdle() call in the playing-sync effect fires
          // before the ResizeObserver has set the canvas width, so the
          // first frame is drawn into a zero-width canvas.  Re-rendering
          // here ensures the playhead is visible as soon as layout resolves.
          // During playback the animation loop immediately overwrites this.
          plasmaRef.current?.renderIdle();
        }
      });
      observer.observe(el);

      return () => observer.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
      render(frequencyData: Uint8Array | null, loudness: number) {
        plasmaRef.current?.render(frequencyData, loudness);
      },
      renderIdle() {
        plasmaRef.current?.renderIdle();
      },
    }));

    const style: CSSProperties = {
      '--drawer-height': `${drawerHeight}px`,
    } as CSSProperties;

    return (
      <div ref={containerRef} className="runway__playhead" style={style}>
        <PlasmaPlayhead ref={plasmaRef} width={0} />
      </div>
    );
  },
);

Playhead.displayName = 'Playhead';

export default Playhead;
