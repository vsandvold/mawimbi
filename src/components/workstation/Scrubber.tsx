import React, { useCallback, useEffect, useRef } from 'react';
import useAnimation from '../../hooks/useAnimation';
import useDebounced from '../../hooks/useDebounced';
import AudioService from '../../services/AudioService';
import './Scrubber.css';
import useWorkstationDispatchContext from './useWorkstationDispatchContext';
import {
  SET_TRANSPORT_TIME,
  STOP_PLAYBACK,
  TOGGLE_PLAYBACK,
} from './workstationReducer';

type ScrubberProps = {
  isPlaying: boolean;
  pixelsPerSecond: number;
  transportTime: number;
  children: JSX.Element[] | JSX.Element;
};

const Scrubber = ({
  isPlaying,
  pixelsPerSecond,
  transportTime,
  children,
}: ScrubberProps) => {
  console.log('Scrubber render');

  const dispatch = useWorkstationDispatchContext();

  const scrollRef = useRef<HTMLDivElement>(null);

  const setScrollPosition = useCallback(
    (transportTime: number) => {
      if (scrollRef.current) {
        const scrollPosition = Math.trunc(transportTime * pixelsPerSecond);
        scrollRef.current.scrollLeft = scrollPosition;
      }
    },
    [pixelsPerSecond, scrollRef]
  );

  useEffect(() => {
    setScrollPosition(transportTime);
  }, [transportTime, setScrollPosition]);

  const animateScrollCallback = useCallback(() => {
    function updateScrollPosition() {
      // Update scroll position directly from transport time for performance reasons
      const transportTime = AudioService.getTransportTime();
      setScrollPosition(transportTime);
    }

    function stopPlaybackIfEndOfScroll() {
      if (scrollRef.current) {
        const isEndOfScroll =
          scrollRef.current.scrollLeft + scrollRef.current.clientWidth >=
          scrollRef.current.scrollWidth;
        if (isEndOfScroll) {
          dispatch([STOP_PLAYBACK]);
        }
      }
    }

    updateScrollPosition();
    stopPlaybackIfEndOfScroll();
  }, [setScrollPosition]);

  useAnimation(animateScrollCallback, {
    isActive: isPlaying,
  });

  const setTransportTime = () => {
    if (isPlaying) {
      return;
    }
    if (scrollRef.current) {
      const scrollPosition = scrollRef.current.scrollLeft;
      const transportTime = scrollPosition / pixelsPerSecond;
      dispatch([SET_TRANSPORT_TIME, transportTime]);
    }
  };

  const debouncedSetTransportTime = useDebounced(setTransportTime, {
    timeoutMs: 200,
  });

  const togglePlayback = () => {
    dispatch([TOGGLE_PLAYBACK]);
  };

  return (
    <div className="scrubber">
      <div
        className="scrubber__timeline"
        ref={scrollRef}
        onClick={togglePlayback}
        onScroll={debouncedSetTransportTime}
      >
        {children}
      </div>
      <div className="scrubber__progress">
        <div className="progress" />
      </div>
    </div>
  );
};

export default Scrubber;
