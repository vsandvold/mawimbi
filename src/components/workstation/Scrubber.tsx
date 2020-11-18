import { StepBackwardOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import classNames from 'classnames';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import useAnimation from '../../hooks/useAnimation';
import useDebounced from '../../hooks/useDebounced';
import AudioService from '../../services/AudioService';
import './Scrubber.css';
import useWorkstationDispatch from './useWorkstationDispatch';
import {
  SET_TRANSPORT_TIME,
  STOP_AND_REWIND_PLAYBACK,
  STOP_PLAYBACK,
  TOGGLE_PLAYBACK,
} from './workstationReducer';

type ScrubberProps = React.PropsWithChildren<{
  drawerHeight: number;
  isDrawerOpen: boolean;
  isPlaying: boolean;
  pixelsPerSecond: number;
  transportTime: number;
}>;

const TIMELINE_MARGIN = 40;

const Scrubber = (props: ScrubberProps) => {
  const {
    drawerHeight,
    isDrawerOpen,
    isPlaying,
    pixelsPerSecond,
    transportTime,
  } = props;

  const dispatch = useWorkstationDispatch();

  const [isRewindButtonHidden, setIsRewindButtonHidden] = useState(true);

  const toggleRewindButton = (scrollPosition: number) => {
    setIsRewindButtonHidden(scrollPosition < 10);
  };

  const timelineScrollRef = useRef<HTMLDivElement>(null);

  const setScrollPosition = useCallback(
    (transportTime: number) => {
      if (timelineScrollRef.current) {
        const scrollPosition = Math.trunc(transportTime * pixelsPerSecond);
        timelineScrollRef.current.scrollLeft = scrollPosition;
        toggleRewindButton(scrollPosition);
      }
    },
    [pixelsPerSecond, timelineScrollRef]
  );

  useEffect(() => {
    setScrollPosition(transportTime);
  }, [transportTime, setScrollPosition]);

  const animateScrollCallback = useCallback(() => {
    function updateScrollPosition() {
      // Updates scroll position directly from transport time for performance reasons
      const transportTime = AudioService.getTransportTime();
      setScrollPosition(transportTime);
    }

    function stopPlaybackIfEndOfScroll() {
      if (timelineScrollRef.current) {
        const isEndOfScroll =
          timelineScrollRef.current.scrollLeft +
            timelineScrollRef.current.clientWidth >=
          timelineScrollRef.current.scrollWidth;
        if (isEndOfScroll) {
          dispatch([STOP_PLAYBACK]);
        }
      }
    }

    updateScrollPosition();
    stopPlaybackIfEndOfScroll();
  }, [setScrollPosition]); // dispatch never changes, and can safely be omitted from dependencies

  useAnimation(animateScrollCallback, {
    isActive: isPlaying,
  });

  const setTransportTime = () => {
    if (isPlaying) {
      return;
    }
    if (timelineScrollRef.current) {
      const scrollPosition = timelineScrollRef.current.scrollLeft;
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

  const stopAndRewindPlayback = () => {
    dispatch([STOP_AND_REWIND_PLAYBACK]);
  };

  const rewindButtonClass = classNames('scrubber__rewind', {
    'scrubber__rewind--hidden': isRewindButtonHidden,
  });

  const [timelineScaleFactor, setTimelineScaleFactor] = useState(1.0);

  useLayoutEffect(() => {
    if (timelineScrollRef.current) {
      // TODO: or use clientHeight?
      const timelineHeight = timelineScrollRef.current.offsetHeight;
      const scaleFactor = (timelineHeight - drawerHeight) / timelineHeight;
      setTimelineScaleFactor(scaleFactor);
    }
  }, [drawerHeight]);

  const timelineScaleStyle = getTimelineStyle(
    isDrawerOpen,
    timelineScaleFactor
  );

  const rewindButtonTranslateStyle = getRewindButtonStyle(
    isDrawerOpen,
    drawerHeight,
    timelineScaleFactor
  );

  const cursorClass = classNames('cursor', {
    'cursor--is-playing': isPlaying,
  });

  return (
    <div className="scrubber scrubber--firefox-scroll-fix">
      <div
        ref={timelineScrollRef}
        className="scrubber__timeline"
        style={timelineScaleStyle}
        onClick={togglePlayback}
        onScroll={debouncedSetTransportTime}
      >
        {props.children}
      </div>
      <div className="scrubber__shade" style={timelineScaleStyle}>
        <div className="shade"></div>
      </div>
      <div className="scrubber__cursor" style={timelineScaleStyle}>
        <div className={cursorClass}></div>
      </div>
      <div className={rewindButtonClass} style={rewindButtonTranslateStyle}>
        <Button
          type="link"
          size="large"
          className="button"
          title="Rewind"
          icon={<StepBackwardOutlined />}
          onClick={stopAndRewindPlayback}
        />
      </div>
    </div>
  );
};

const defaultTransformStyle = {
  transformOrigin: 'top left',
  transition: 'transform 0.3s',
  willChange: 'transform',
};

function getTimelineStyle(isDrawerOpen: boolean, timelineScaleFactor: number) {
  return isDrawerOpen
    ? { ...defaultTransformStyle, transform: `scaleY(${timelineScaleFactor})` }
    : defaultTransformStyle;
}

function getRewindButtonStyle(
  isDrawerOpen: boolean,
  drawerHeight: number,
  timelineScaleFactor: number
) {
  const translateAmount =
    drawerHeight - TIMELINE_MARGIN * (1 - timelineScaleFactor);
  return isDrawerOpen
    ? {
        ...defaultTransformStyle,
        transform: `translateY(-${translateAmount}px)`,
      }
    : defaultTransformStyle;
}

export default Scrubber;
