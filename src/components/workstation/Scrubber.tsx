import { FastBackwardOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import React, { useRef } from 'react';
import Tone from 'tone';
import useAnimation from '../../hooks/useAnimation';
import './Scrubber.css';

type ScrubberProps = {
  isPlaying: boolean;
  stopPlayback: Function;
  pixelsPerSecond: number;
  children: JSX.Element[] | JSX.Element;
};

const Scrubber = ({
  isPlaying,
  stopPlayback,
  pixelsPerSecond,
  children,
}: ScrubberProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const updateScrollPosition = () => {
    const transportTime = Tone.Transport.seconds;
    if (scrollRef.current) {
      const scrollPosition = Math.trunc(transportTime * pixelsPerSecond);
      scrollRef.current.scrollLeft = scrollPosition;
    }
  };

  useAnimation(updateScrollPosition, [isPlaying], {
    frameRate: 60,
    isActive: isPlaying,
  });

  const stopAndRewindPlayback = () => {
    stopPlayback();
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  };

  console.log('Scrubber render');

  return (
    <div className="scrubber">
      <div className="scrubber__timeline" ref={scrollRef}>
        {children}
      </div>
      <div className="scrubber__progress">
        <div className="progress" />
      </div>
      <div className="scrubber__rewind">
        <Button
          type="link"
          ghost
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
