import {
  type CSSProperties,
  forwardRef,
  PropsWithChildren,
  useImperativeHandle,
  useLayoutEffect,
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
import { useTuningAvailable } from './useTuningActivation';
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
    playheadWidthFraction,
  } = useScrubberGeometry(drawerHeight);

  const isTuningAvailable = useTuningAvailable();
  const {
    config: tuningConfig,
    close: closeTuning,
    selectPreset: selectTuningPreset,
    setValue: setTuningValue,
  } = useTuningOverlay();

  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
    handleWheel,
    handleScroll,
    isUserScrubbing,
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

  // Re-map the scroll position to the transport time whenever the solved
  // geometry changes the time↔scroll mapping — drawer open/close, window
  // resize, orientation change, fullscreen/address-bar transitions
  // (mawimbi#462). During playback the animation loop re-syncs every frame
  // anyway; while stopped or paused, a stale scrollTop would leave content
  // drifted off the playhead line. Skipped while a user scrub is in
  // flight — transportTime is stale until the debounced seek commits, and
  // that seek re-derives the time from the final scroll position anyway
  // (see isUserScrubbing). Layout effect so it runs after the new padding
  // custom properties have been committed to the DOM.
  useLayoutEffect(() => {
    if (!playback.isPlaying && !isUserScrubbing()) {
      syncScrollToTime(playback.transportTime);
    }
    // playback is a stable service bridge; transportTime is read as a
    // snapshot on purpose — only geometry changes should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visibleHeight,
    timelinePaddingTopPx,
    timelinePaddingBottomPx,
    isUserScrubbing,
    syncScrollToTime,
  ]);

  // A native click can still fire after movement crosses the scrub
  // threshold (the browser's own click-vs-drag tolerance doesn't match
  // SCRUB_MOVEMENT_THRESHOLD_PX) — once that movement has registered as a
  // gesture, this is no longer "a tap" per this app's own model (C4: tap
  // toggles, drags seek), so it must not also toggle playback.
  const handleTimelineClick = () => {
    if (isUserScrubbing()) return;
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
        onPointerMove={handlePointerMove}
        onPointerEnd={handlePointerEnd}
        onScroll={handleScroll}
        onWheel={handleWheel}
      />
      <Playhead
        ref={playheadRef}
        visibleHeight={visibleHeight}
        meterWidthFraction={playheadWidthFraction}
      />
      <ZoomControls style={zoomControlsStyle} />
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
