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
  const offsetRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<PlayheadHandle>(null);

  const {
    containerRef,
    viewportStyle,
    tiltStyle,
    geometry,
    playheadFraction,
    visibleHeight,
    timelinePaddingTopPx,
    timelinePaddingBottomPx,
    runwayWindowTopPx,
  } = useScrubberGeometry(drawerHeight);

  const isTuningAvailable = useTuningAvailable();
  const {
    config: tuningConfig,
    toggle: toggleTuning,
    close: closeTuning,
    selectPreset: selectTuningPreset,
    setValue: setTuningValue,
  } = useTuningOverlay();
  const longPressZoomControls = useLongPress(toggleTuning);

  const {
    handlePointerDown,
    handlePointerUp,
    handleWheel,
    handleScroll,
    syncScrollToTime,
  } = useScrubberScroll({
    phantomRef,
    offsetRef,
    playheadRef,
    pixelsPerSecond,
  });

  useTimelineZoom(phantomRef);

  const spacerHeight = useSpacerHeight(offsetRef);

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
  const scrubberStyle = getScrubberStyle(
    playheadFraction,
    timelinePaddingTopPx,
    timelinePaddingBottomPx,
    runwayWindowTopPx,
    visibleHeight,
  );

  return (
    <div className="scrubber" style={scrubberStyle}>
      <ScrubberViewport style={viewportStyle}>
        <ScrubberTilt
          ref={containerRef}
          offsetRef={offsetRef}
          style={tiltStyle}
        >
          {props.children}
        </ScrubberTilt>
      </ScrubberViewport>
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
      {isTuningAvailable && tuningConfig && (
        <TuningOverlay
          config={tuningConfig}
          geometry={geometry}
          close={closeTuning}
          selectPreset={selectTuningPreset}
          setValue={setTuningValue}
        />
      )}
    </div>
  );
});

Scrubber.displayName = 'Scrubber';

export default Scrubber;

/**
 * When the drawer is open, shrinks an `inset: 0` overlay's clickable/visible
 * area to the same drawer-adjusted visible box `useScrubberGeometry` solves
 * against — shared by every such overlay so they can't drift out of sync
 * with each other or with the geometry itself.
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

function getZoomControlsStyle(drawerHeight: number): CSSProperties {
  return {
    ...baseTransformStyle,
    transform: `translateY(-${drawerHeight}px)`,
  };
}

/**
 * Exposes the playhead's screen-space position, the timeline's
 * projection-corrected content padding, and the runway's canvas window (the
 * pre-transform local-Y span that can project into view) as CSS custom
 * properties on the shared ancestor. Timeline.css, the playhead overlay,
 * and the spectrogram canvases all inherit these, so layout (where "now"
 * is scrolled to), geometry (the 3D transform), and canvas coverage stay
 * anchored to the same runway instead of drifting apart.
 */
function getScrubberStyle(
  playheadFraction: number,
  timelinePaddingTopPx: number,
  timelinePaddingBottomPx: number,
  runwayWindowTopPx: number,
  visibleHeight: number,
): CSSProperties {
  return {
    '--playhead-fraction': playheadFraction,
    '--timeline-padding-top': `${timelinePaddingTopPx}px`,
    '--timeline-padding-bottom': `${timelinePaddingBottomPx}px`,
    '--runway-window-top': `${runwayWindowTopPx}px`,
    '--runway-window-bottom': `${visibleHeight}px`,
  } as CSSProperties;
}
