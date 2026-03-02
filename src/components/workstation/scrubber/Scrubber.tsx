import { StepBackwardOutlined } from '@ant-design/icons';
import { useSignals } from '@preact/signals-react/runtime';
import { Button } from 'antd';
import classNames from 'classnames';
import { PropsWithChildren } from 'react';
import { togglePlayback } from '../../../signals/transportSignals';
import { type Track } from '../../../types/track';
import ZoomControls from '../ZoomControls';
import PlasmaPlayhead from './PlasmaPlayhead';
import './Scrubber.css';
import { useScrubber } from './useScrubber';

type ScrubberProps = PropsWithChildren<{
  drawerHeight: number;
  isMixerOpen: boolean;
  pixelsPerSecond: number;
  tracks: Track[];
}>;

const Scrubber = (props: ScrubberProps) => {
  useSignals();
  const { drawerHeight, isMixerOpen, pixelsPerSecond, tracks } = props;

  const {
    timelineScrollRef,
    cursorContainerRef,
    plasmaRef,
    playing,
    isRewindButtonHidden,
    timelineScaleStyle,
    rewindButtonStyle,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleStopAndRewind,
  } = useScrubber({ drawerHeight, isMixerOpen, pixelsPerSecond, tracks });

  const handleTogglePlayback = () => {
    togglePlayback();
  };

  const rewindButtonClass = classNames('scrubber__rewind', {
    'scrubber__rewind--hidden': isRewindButtonHidden,
  });

  const revealClass = classNames('scrubber__reveal', {
    'scrubber__reveal--active': playing,
  });

  return (
    <div className="scrubber scrubber--firefox-scroll-fix">
      <div
        ref={timelineScrollRef}
        className="scrubber__timeline"
        style={timelineScaleStyle}
        onClick={handleTogglePlayback}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
      >
        {props.children}
      </div>
      <div className="scrubber__shade" style={timelineScaleStyle}>
        <div className="shade"></div>
      </div>
      <div className={revealClass} style={timelineScaleStyle}></div>
      <div
        ref={cursorContainerRef}
        className="scrubber__cursor"
        style={timelineScaleStyle}
      >
        <PlasmaPlayhead ref={plasmaRef} height={0} />
      </div>
      <div className={rewindButtonClass} style={rewindButtonStyle}>
        <Button
          type="link"
          size="large"
          className="button"
          title="Rewind"
          icon={<StepBackwardOutlined />}
          onClick={handleStopAndRewind}
        />
      </div>
      <ZoomControls style={rewindButtonStyle} />
    </div>
  );
};

export default Scrubber;
