import {
  type CSSProperties,
  forwardRef,
  PropsWithChildren,
  useImperativeHandle,
  useRef,
} from 'react';
import { usePlaybackService } from '../../playback/usePlaybackService';
import { useRecordingService } from '../../recording/useRecordingService';
import Playhead, { type PlayheadHandle } from './Playhead';
import ScrubberTilt from './ScrubberTilt';
import ScrubberViewport from './ScrubberViewport';
import ZoomControls from './ZoomControls';
import { useScrubberGeometry } from './useScrubberGeometry';
import { useScrubberScroll } from './useScrubberScroll';
import './Scrubber.css';

export type ScrubberHandle = {
  syncScrollToTime: (time: number) => void;
};

type ScrubberProps = PropsWithChildren<{
  drawerHeight: number;
  onStopRecording: () => void;
  pixelsPerSecond: number;
}>;

const baseTransformStyle = {
  willChange: 'transform',
  transition: 'transform 0.25s ease-out',
};

const Scrubber = forwardRef<ScrubberHandle, ScrubberProps>((props, ref) => {
  const playback = usePlaybackService();
  const recording = useRecordingService();
  const { drawerHeight, onStopRecording, pixelsPerSecond } = props;

  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<PlayheadHandle>(null);

  const { containerRef, viewportStyle, tiltStyle } =
    useScrubberGeometry(drawerHeight);

  const {
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleViewportWheel,
    handleViewportTouchStart,
    handleViewportTouchMove,
    isTouchScrollingRef,
    syncScrollToTime,
  } = useScrubberScroll({ scrollRef, playheadRef, pixelsPerSecond });

  useImperativeHandle(ref, () => ({ syncScrollToTime }), [syncScrollToTime]);

  const handleTimelineClick = () => {
    // Suppress click synthesized after a touch-scroll swipe
    if (isTouchScrollingRef.current) return;
    if (recording.isCountingIn || recording.isActivelyRecording) {
      onStopRecording();
      return;
    }
    playback.togglePlayback();
  };

  // Click handler for the viewport wrapper — catches clicks in the
  // dead-zone corners outside the tilted scroll container's trapezoid.
  const handleViewportClick = (e: React.MouseEvent) => {
    if (isTouchScrollingRef.current) return;
    if (scrollRef.current?.contains(e.target as Node)) return;
    handleTimelineClick();
  };

  const zoomControlsStyle = getZoomControlsStyle(drawerHeight);

  // Merge the geometry ref with the scroll ref — both need the same element.
  // useScrubberGeometry tracks the container height; useScrubberScroll reads
  // scroll position. We use a callback ref to wire both.
  const tiltRef = (el: HTMLDivElement | null) => {
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current =
      el;
  };

  return (
    <div className="scrubber scrubber--firefox-scroll-fix">
      <ScrubberViewport
        style={viewportStyle}
        onClick={handleViewportClick}
        onWheel={handleViewportWheel}
        onTouchStart={handleViewportTouchStart}
        onTouchMove={handleViewportTouchMove}
      >
        <ScrubberTilt
          ref={tiltRef}
          style={tiltStyle}
          onClick={handleTimelineClick}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
        >
          {props.children}
        </ScrubberTilt>
      </ScrubberViewport>
      <Playhead ref={playheadRef} drawerHeight={drawerHeight} />
      <ZoomControls style={zoomControlsStyle} />
    </div>
  );
});

Scrubber.displayName = 'Scrubber';

export default Scrubber;

function getZoomControlsStyle(drawerHeight: number): CSSProperties {
  return {
    ...baseTransformStyle,
    transform: `translateY(-${drawerHeight}px)`,
  };
}
