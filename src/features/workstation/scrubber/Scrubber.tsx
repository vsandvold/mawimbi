import {
  type CSSProperties,
  forwardRef,
  PropsWithChildren,
  useImperativeHandle,
  useRef,
} from 'react';
import { usePlaybackService } from '../../playback/usePlaybackService';
import { useRecordingService } from '../../recording/useRecordingService';
import { useTimelineZoom } from '../../../shared/hooks/useTimelineZoom';
import Playhead, { type PlayheadHandle } from './Playhead';
import PhantomScroller from './PhantomScroller';
import ScrubberTilt from './ScrubberTilt';
import ScrubberViewport from './ScrubberViewport';
import ZoomControls from './ZoomControls';
import { useScrubberGeometry } from './useScrubberGeometry';
import { useScrubberScroll, useSpacerHeight } from './useScrubberScroll';
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

  const phantomRef = useRef<HTMLDivElement>(null);
  const scrubberTiltRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<PlayheadHandle>(null);

  const { containerRef, viewportStyle, tiltStyle } =
    useScrubberGeometry(drawerHeight);

  const { handleWheel, handleScroll, syncScrollToTime } = useScrubberScroll({
    phantomRef,
    tiltRef: scrubberTiltRef,
    playheadRef,
    pixelsPerSecond,
  });

  useTimelineZoom(phantomRef);

  const spacerHeight = useSpacerHeight(scrubberTiltRef);

  useImperativeHandle(ref, () => ({ syncScrollToTime }), [syncScrollToTime]);

  const handleTimelineClick = () => {
    if (recording.isCountingIn || recording.isActivelyRecording) {
      onStopRecording();
      return;
    }
    playback.togglePlayback();
  };

  const phantomStyle = getPhantomStyle(drawerHeight);
  const zoomControlsStyle = getZoomControlsStyle(drawerHeight);

  // The geometry ref measures the tilt container's height for 3D transform
  // calculations. Assign it via a callback ref alongside the scroll ref.
  const tiltRef = (el: HTMLDivElement | null) => {
    (scrubberTiltRef as React.MutableRefObject<HTMLDivElement | null>).current =
      el;
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current =
      el;
  };

  return (
    <div className="scrubber scrubber--firefox-scroll-fix">
      <ScrubberViewport style={viewportStyle}>
        <ScrubberTilt ref={tiltRef} style={tiltStyle}>
          {props.children}
        </ScrubberTilt>
      </ScrubberViewport>
      <PhantomScroller
        ref={phantomRef}
        spacerHeight={spacerHeight}
        style={phantomStyle}
        onClick={handleTimelineClick}
        onScroll={handleScroll}
        onWheel={handleWheel}
      />
      <Playhead ref={playheadRef} drawerHeight={drawerHeight} />
      <ZoomControls style={zoomControlsStyle} />
    </div>
  );
});

Scrubber.displayName = 'Scrubber';

export default Scrubber;

/**
 * When the drawer is open, shrink the phantom scroller's clickable area
 * so it doesn't overlap the drawer controls.
 */
function getPhantomStyle(drawerHeight: number): CSSProperties | undefined {
  if (drawerHeight <= 0) return undefined;
  return { bottom: `${drawerHeight}px` };
}

function getZoomControlsStyle(drawerHeight: number): CSSProperties {
  return {
    ...baseTransformStyle,
    transform: `translateY(-${drawerHeight}px)`,
  };
}
