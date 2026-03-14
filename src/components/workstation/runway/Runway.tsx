import {
  type CSSProperties,
  forwardRef,
  PropsWithChildren,
  useImperativeHandle,
  useRef,
} from 'react';
import { usePlaybackService } from '../../../hooks/usePlaybackService';
import { useRecordingService } from '../../../hooks/useRecordingService';
import Playhead, { type PlayheadHandle } from './Playhead';
import RunwayTilt from './RunwayTilt';
import RunwayViewport from './RunwayViewport';
import ZoomControls from './ZoomControls';
import { useRunwayGeometry } from './useRunwayGeometry';
import { useRunwayScroll } from './useRunwayScroll';
import './Runway.css';

export type RunwayHandle = {
  syncScrollToTime: (time: number) => void;
};

type RunwayProps = PropsWithChildren<{
  drawerHeight: number;
  onStopRecording: () => void;
  pixelsPerSecond: number;
}>;

const baseTransformStyle = {
  willChange: 'transform',
  transition: 'transform 0.25s ease-out',
};

const Runway = forwardRef<RunwayHandle, RunwayProps>((props, ref) => {
  const playback = usePlaybackService();
  const recording = useRecordingService();
  const { drawerHeight, onStopRecording, pixelsPerSecond } = props;

  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<PlayheadHandle>(null);

  const { containerRef, viewportStyle, tiltStyle } =
    useRunwayGeometry(drawerHeight);

  const {
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleViewportWheel,
    syncScrollToTime,
  } = useRunwayScroll({ scrollRef, playheadRef, pixelsPerSecond });

  useImperativeHandle(ref, () => ({ syncScrollToTime }), [syncScrollToTime]);

  const handleTimelineClick = () => {
    if (recording.isCountingIn || recording.isActivelyRecording) {
      onStopRecording();
      return;
    }
    playback.togglePlayback();
  };

  // Click handler for the viewport wrapper — catches clicks in the
  // dead-zone corners outside the tilted scroll container's trapezoid.
  const handleViewportClick = (e: React.MouseEvent) => {
    if (scrollRef.current?.contains(e.target as Node)) return;
    handleTimelineClick();
  };

  const zoomControlsStyle = getZoomControlsStyle(drawerHeight);

  // Merge the geometry ref with the scroll ref — both need the same element.
  // useRunwayGeometry tracks the container height; useRunwayScroll reads
  // scroll position. We use a callback ref to wire both.
  const tiltRef = (el: HTMLDivElement | null) => {
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current =
      el;
  };

  return (
    <div className="runway runway--firefox-scroll-fix">
      <RunwayViewport
        style={viewportStyle}
        onClick={handleViewportClick}
        onWheel={handleViewportWheel}
      >
        <RunwayTilt
          ref={tiltRef}
          style={tiltStyle}
          onClick={handleTimelineClick}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
        >
          {props.children}
        </RunwayTilt>
      </RunwayViewport>
      <Playhead ref={playheadRef} drawerHeight={drawerHeight} />
      <ZoomControls style={zoomControlsStyle} />
    </div>
  );
});

Runway.displayName = 'Runway';

export default Runway;

function getZoomControlsStyle(drawerHeight: number): CSSProperties {
  return {
    ...baseTransformStyle,
    transform: `translateY(-${drawerHeight}px)`,
  };
}
