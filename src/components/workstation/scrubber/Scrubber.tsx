import { StepBackwardOutlined } from '@ant-design/icons';
import { useSignals } from '@preact/signals-react/runtime';
import { Button } from 'antd';
import classNames from 'classnames';
import { PropsWithChildren } from 'react';
import { togglePlayback } from '../../../signals/transportSignals';
import './Scrubber.css';
import { useScrubber } from './useScrubber';

type ScrubberProps = PropsWithChildren<{
  drawerHeight: number;
  isMixerOpen: boolean;
  pixelsPerSecond: number;
}>;

const Scrubber = (props: ScrubberProps) => {
  useSignals();
  const { drawerHeight, isMixerOpen, pixelsPerSecond } = props;

  const {
    timelineScrollRef,
    cursorRef,
    playing,
    isRewindButtonHidden,
    timelineScaleStyle,
    rewindButtonStyle,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleStopAndRewind,
  } = useScrubber({ drawerHeight, isMixerOpen, pixelsPerSecond });

  const handleTogglePlayback = () => {
    togglePlayback();
  };

  const rewindButtonClass = classNames('scrubber__rewind', {
    'scrubber__rewind--hidden': isRewindButtonHidden,
  });

  const cursorClass = classNames('cursor', {
    'cursor--is-playing': playing,
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
      <div className="scrubber__cursor" style={timelineScaleStyle}>
        <div ref={cursorRef} className={cursorClass}></div>
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
    </div>
  );
};

export default Scrubber;
