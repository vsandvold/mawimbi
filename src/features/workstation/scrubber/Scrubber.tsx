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
import ScrubberFog from './ScrubberFog';
import ScrubberTilt from './ScrubberTilt';
import ScrubberViewport from './ScrubberViewport';
import TuningOverlay from './TuningOverlay';
import ZoomControls from './ZoomControls';
import { useLongPress, useTuningAvailable } from './useTuningActivation';
import { useScrubberGeometry } from './useScrubberGeometry';
import { useScrubberScroll, useSpacerHeight } from './useScrubberScroll';
import { useTuningOverlay } from './useTuningOverlay';
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

  const {
    containerRef,
    viewportStyle,
    tiltStyle,
    fogStyle,
    geometry,
    playheadFraction,
    visibleHeight,
    timelinePaddingTopPx,
    timelinePaddingBottomPx,
  } = useScrubberGeometry(drawerHeight);

  const isTuningAvailable = useTuningAvailable();
  const { isOpen: isTuningOpen, toggle: toggleTuning } = useTuningOverlay();
  const longPressZoomControls = useLongPress(toggleTuning);

  const {
    handlePointerDown,
    handlePointerUp,
    handleWheel,
    handleScroll,
    syncScrollToTime,
  } = useScrubberScroll({
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
  const fogOverlayStyle = getFogOverlayStyle(drawerHeight, fogStyle);
  const zoomControlsStyle = getZoomControlsStyle(drawerHeight);
  const scrubberStyle = getScrubberStyle(
    playheadFraction,
    timelinePaddingTopPx,
    timelinePaddingBottomPx,
  );

  // The geometry ref measures the tilt container's height for 3D transform
  // calculations. Assign it via a callback ref alongside the scroll ref.
  const tiltRef = (el: HTMLDivElement | null) => {
    (scrubberTiltRef as React.MutableRefObject<HTMLDivElement | null>).current =
      el;
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current =
      el;
  };

  return (
    <div
      className="scrubber scrubber--firefox-scroll-fix"
      style={scrubberStyle}
    >
      <ScrubberViewport style={viewportStyle}>
        <ScrubberTilt ref={tiltRef} style={tiltStyle}>
          {props.children}
        </ScrubberTilt>
      </ScrubberViewport>
      <ScrubberFog style={fogOverlayStyle} />
      <PhantomScroller
        ref={phantomRef}
        spacerHeight={spacerHeight}
        style={phantomStyle}
        onClick={handleTimelineClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onScroll={handleScroll}
        onWheel={handleWheel}
      />
      <Playhead ref={playheadRef} visibleHeight={visibleHeight} />
      <ZoomControls
        style={zoomControlsStyle}
        {...(isTuningAvailable ? longPressZoomControls : undefined)}
      />
      {isTuningAvailable && isTuningOpen && (
        <TuningOverlay geometry={geometry} />
      )}
    </div>
  );
});

Scrubber.displayName = 'Scrubber';

export default Scrubber;

/**
 * When the drawer is open, shrinks an `inset: 0` overlay's clickable/visible
 * area to the same drawer-adjusted visible box `useScrubberGeometry` solves
 * against — shared by every such overlay (phantom scroller, fog) so they
 * can't drift out of sync with each other or with the geometry itself.
 */
function getDrawerBottomStyle(drawerHeight: number): CSSProperties | undefined {
  if (drawerHeight <= 0) return undefined;
  return { bottom: `${drawerHeight}px` };
}

/**
 * When the drawer is open, shrink the phantom scroller's clickable area
 * so it doesn't overlap the drawer controls.
 */
function getPhantomStyle(drawerHeight: number): CSSProperties | undefined {
  return getDrawerBottomStyle(drawerHeight);
}

/**
 * When the drawer is open, shrink the fog overlay to match the same
 * drawer-adjusted visible area the gradient itself was solved against.
 */
function getFogOverlayStyle(
  drawerHeight: number,
  fogStyle: CSSProperties,
): CSSProperties {
  return { ...fogStyle, ...getDrawerBottomStyle(drawerHeight) };
}

function getZoomControlsStyle(drawerHeight: number): CSSProperties {
  return {
    ...baseTransformStyle,
    transform: `translateY(-${drawerHeight}px)`,
  };
}

/**
 * Exposes the playhead's screen-space position and the timeline's
 * projection-corrected content padding as CSS custom properties on the
 * shared ancestor. Timeline.css and the playhead overlay both inherit
 * these, so layout (where "now" is scrolled to) and geometry (the 3D
 * transform) stay anchored to the same runway instead of drifting apart.
 */
function getScrubberStyle(
  playheadFraction: number,
  timelinePaddingTopPx: number,
  timelinePaddingBottomPx: number,
): CSSProperties {
  return {
    '--playhead-fraction': playheadFraction,
    '--timeline-padding-top': `${timelinePaddingTopPx}px`,
    '--timeline-padding-bottom': `${timelinePaddingBottomPx}px`,
  } as CSSProperties;
}
