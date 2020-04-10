import { FastBackwardOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import React, { useRef } from 'react';
import useAnimation from '../../hooks/useAnimation';
import useDebounced from '../../hooks/useDebounced';
import AudioService from '../../services/AudioService';
import './Scrubber.css';
import useWorkstationContext from './useWorkstationContext';
import {
  SEEK_TRANSPORT_TIME,
  STOP_PLAYBACK,
  TOGGLE_PLAYBACK,
} from './useWorkstationState';

type ScrubberProps = {
  isPlaying: boolean;
  pixelsPerSecond: number;
  children: JSX.Element[] | JSX.Element;
};

const Scrubber = ({ isPlaying, pixelsPerSecond, children }: ScrubberProps) => {
  console.log('Scrubber render');

  const [workstationDispatch] = useWorkstationContext();

  const scrollRef = useRef<HTMLDivElement>(null);

  const updateScrollPosition = () => {
    if (scrollRef.current) {
      const transportTime = AudioService.getTransportTime();
      const scrollPosition = Math.trunc(transportTime * pixelsPerSecond);
      scrollRef.current.scrollLeft = scrollPosition;
    }
  };

  useAnimation(updateScrollPosition, [isPlaying], {
    frameRate: 60,
    isActive: isPlaying,
  });

  const seekTransportTime = () => {
    if (isPlaying) {
      return;
    }
    if (scrollRef.current) {
      const scrollPosition = scrollRef.current.scrollLeft;
      const transportTime = scrollPosition / pixelsPerSecond;
      workstationDispatch([SEEK_TRANSPORT_TIME, transportTime]);
    }
  };

  const debouncedSeekTransportTime = useDebounced(seekTransportTime, {
    timeoutMs: 200,
  });

  const togglePlayback = () => {
    workstationDispatch([TOGGLE_PLAYBACK]);
  };

  const stopAndRewindPlayback = () => {
    workstationDispatch([STOP_PLAYBACK]);
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
      workstationDispatch([SEEK_TRANSPORT_TIME, 0]);
    }
  };

  return (
    <div className="scrubber">
      <div
        className="scrubber__timeline"
        ref={scrollRef}
        onClick={togglePlayback}
        onScroll={debouncedSeekTransportTime}
      >
        {children}
      </div>
      <div className="scrubber__progress">
        <div className="progress" />
      </div>
      <div className="scrubber__rewind">
        <Button
          type="link"
          size="large"
          icon={<FastBackwardOutlined />}
          title="Rewind"
          onClick={stopAndRewindPlayback}
        />
      </div>
    </div>
  );
};

export default Scrubber;
