import { SkipBack } from 'lucide-react';
import { Button } from '../../ui/button';
import classNames from 'classnames';
import { PropsWithChildren } from 'react';
import { usePlaybackService } from '../../../hooks/usePlaybackService';
import { useRecordingService } from '../../../hooks/useRecordingService';
import { type Track } from '../../../types/track';
import ZoomControls from '../ZoomControls';
import PlasmaPlayhead from './PlasmaPlayhead';
import './Scrubber.css';
import { useScrubber } from './useScrubber';

type ScrubberProps = PropsWithChildren<{
  drawerHeight: number;
  onStopRecording: () => void;
  pixelsPerSecond: number;
  tracks: Track[];
}>;

const Scrubber = (props: ScrubberProps) => {
  const playback = usePlaybackService();
  const recording = useRecordingService();
  const { drawerHeight, onStopRecording, pixelsPerSecond, tracks } = props;

  const {
    timelineScrollRef,
    cursorContainerRef,
    plasmaRef,
    isRewindButtonHidden,
    timelineScaleStyle,
    rewindButtonStyle,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleStopAndRewind,
  } = useScrubber({ drawerHeight, pixelsPerSecond, tracks });

  const handleTimelineClick = () => {
    if (recording.isCountingIn || recording.isActivelyRecording) {
      onStopRecording();
      return;
    }
    playback.togglePlayback();
  };

  const rewindButtonClass = classNames('scrubber__rewind', {
    'scrubber__rewind--hidden': isRewindButtonHidden,
  });

  return (
    <div className="scrubber scrubber--firefox-scroll-fix">
      <div
        ref={timelineScrollRef}
        className="scrubber__timeline"
        style={timelineScaleStyle}
        onClick={handleTimelineClick}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
      >
        {props.children}
      </div>
      <div className="scrubber__shade" style={timelineScaleStyle}>
        <div className="shade"></div>
      </div>
      <div
        ref={cursorContainerRef}
        className="scrubber__cursor"
        style={timelineScaleStyle}
      >
        <PlasmaPlayhead ref={plasmaRef} height={0} />
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
};

export default Scrubber;
