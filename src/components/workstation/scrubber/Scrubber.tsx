import { SkipBack } from 'lucide-react';
import { Button } from '../../ui/button';
import classNames from 'classnames';
import { forwardRef, PropsWithChildren, useImperativeHandle } from 'react';
import { usePlaybackService } from '../../../hooks/usePlaybackService';
import { useRecordingService } from '../../../hooks/useRecordingService';
import ZoomControls from '../ZoomControls';
import PlasmaPlayhead from './PlasmaPlayhead';
import './Scrubber.css';
import { useScrubber } from './useScrubber';

export type ScrubberHandle = {
  syncScrollToTime: (time: number) => void;
};

type ScrubberProps = PropsWithChildren<{
  drawerHeight: number;
  onStopRecording: () => void;
  pixelsPerSecond: number;
}>;

const Scrubber = forwardRef<ScrubberHandle, ScrubberProps>((props, ref) => {
  const playback = usePlaybackService();
  const recording = useRecordingService();
  const { drawerHeight, onStopRecording, pixelsPerSecond } = props;

  const {
    timelineScrollRef,
    cursorContainerRef,
    plasmaRef,
    isRewindButtonHidden,
    timelineScrollStyle,
    timelineOverlayStyle,
    rewindButtonStyle,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handlePerspectiveWheel,
    handleStopAndRewind,
    syncScrollToTime,
  } = useScrubber({ drawerHeight, pixelsPerSecond });

  useImperativeHandle(ref, () => ({ syncScrollToTime }), [syncScrollToTime]);

  const handleTimelineClick = () => {
    if (recording.isCountingIn || recording.isActivelyRecording) {
      onStopRecording();
      return;
    }
    playback.togglePlayback();
  };

  // Click handler for the perspective wrapper — catches clicks in the
  // dead-zone corners outside the tilted scroll container's trapezoid.
  const handlePerspectiveClick = (e: React.MouseEvent) => {
    if (timelineScrollRef.current?.contains(e.target as Node)) return;
    handleTimelineClick();
  };

  const rewindButtonClass = classNames('scrubber__rewind', {
    'scrubber__rewind--hidden': isRewindButtonHidden,
  });

  return (
    <div className="scrubber scrubber--firefox-scroll-fix">
      <div
        className="scrubber__perspective"
        onClick={handlePerspectiveClick}
        onWheel={handlePerspectiveWheel}
      >
        <div
          ref={timelineScrollRef}
          className="scrubber__timeline"
          style={timelineScrollStyle}
          onClick={handleTimelineClick}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
        >
          {props.children}
        </div>
      </div>
      <div className="scrubber__shade" style={timelineOverlayStyle}>
        <div className="shade"></div>
      </div>
      <div
        ref={cursorContainerRef}
        className="scrubber__cursor"
        style={timelineOverlayStyle}
      >
        <PlasmaPlayhead ref={plasmaRef} width={0} />
      </div>
      <div className={rewindButtonClass} style={rewindButtonStyle}>
        <Button
          variant="ghost"
          size="icon-lg"
          className="button"
          title="Rewind"
          onClick={handleStopAndRewind}
        >
          <SkipBack />
        </Button>
      </div>
      <ZoomControls style={rewindButtonStyle} />
    </div>
  );
});

Scrubber.displayName = 'Scrubber';

export default Scrubber;
