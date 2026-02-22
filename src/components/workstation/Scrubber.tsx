import { StepBackwardOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import classNames from 'classnames';
import {
  PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useAudioService } from '../../hooks/useAudioService';
import useDebounced from '../../hooks/useDebounced';
import {
  isPlaying,
  loudness as loudnessSignal,
  stopAndRewindPlayback,
  togglePlayback,
  transportTime,
} from '../../signals/transportSignals';
import './Scrubber.css';

type ScrubberProps = PropsWithChildren<{
  drawerHeight: number;
  isMixerOpen: boolean;
  pixelsPerSecond: number;
}>;

const TIMELINE_MARGIN = 40;

const Scrubber = (props: ScrubberProps) => {
  const { drawerHeight, isMixerOpen, pixelsPerSecond } = props;

  const playing = isPlaying.value;

  const [isRewindButtonHidden, setIsRewindButtonHidden] = useState(true);

  const toggleRewindButton = (scrollPosition: number) => {
    setIsRewindButtonHidden(scrollPosition < 10);
  };

  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef(false);
  const shouldResumeRef = useRef(false);

  const setScrollPosition = (time: number) => {
    if (timelineScrollRef.current) {
      const scrollPosition = Math.trunc(time * pixelsPerSecond);
      if (timelineScrollRef.current.scrollLeft !== scrollPosition) {
        isProgrammaticScrollRef.current = true;
        timelineScrollRef.current.scrollLeft = scrollPosition;
      }
      toggleRewindButton(scrollPosition);
    }
  };

  const audioService = useAudioService();

  // Animation loop: runs during playback, reads from audio engine, updates DOM directly
  useEffect(() => {
    if (!playing) return;

    let rafId = 0;

    const animate = () => {
      if (!shouldResumeRef.current) {
        const time = audioService.getTransportTime();
        transportTime.value = time;
        setScrollPosition(time);

        const currentLoudness = audioService.mixer.getLoudness();
        loudnessSignal.value = currentLoudness;
        cursorRef.current?.style.setProperty(
          '--loudness',
          String(currentLoudness),
        );

        if (timelineScrollRef.current) {
          const isEndOfScroll =
            timelineScrollRef.current.scrollLeft +
              timelineScrollRef.current.clientWidth >=
            timelineScrollRef.current.scrollWidth;
          if (isEndOfScroll) {
            stopAndRewindPlayback();
            return;
          }
        }
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafId);
  }, [playing, pixelsPerSecond]);

  // Sync scroll position to transportTime when not playing (e.g. after rewind)
  useEffect(() => {
    if (!playing) {
      setScrollPosition(transportTime.peek());
    }
  }, [playing, pixelsPerSecond]);

  const setTransportTimeFromScroll = () => {
    if (timelineScrollRef.current) {
      const scrollPosition = timelineScrollRef.current.scrollLeft;
      const time = scrollPosition / pixelsPerSecond;
      transportTime.value = time;
      audioService.setTransportTime(time);
    }
    if (shouldResumeRef.current) {
      shouldResumeRef.current = false;
      isPlaying.value = true;
    }
  };

  const debouncedSetTransportTime = useDebounced(setTransportTimeFromScroll, {
    timeoutMs: 200,
  });

  const pauseForUserScroll = () => {
    if (playing && !shouldResumeRef.current) {
      shouldResumeRef.current = true;
      isPlaying.value = false;
    }
  };

  const handleWheel = () => {
    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  const handleTouchMove = () => {
    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      return;
    }

    if (timelineScrollRef.current) {
      toggleRewindButton(timelineScrollRef.current.scrollLeft);
    }

    pauseForUserScroll();
    debouncedSetTransportTime();
  };

  const handleTogglePlayback = () => {
    togglePlayback();
  };

  const handleStopAndRewind = () => {
    stopAndRewindPlayback();
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

  const timelineScaleStyle = getTimelineStyle(isMixerOpen, timelineScaleFactor);

  const rewindButtonTranslateStyle = getRewindButtonStyle(
    isMixerOpen,
    drawerHeight,
    timelineScaleFactor,
  );

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
      <div className={rewindButtonClass} style={rewindButtonTranslateStyle}>
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

const defaultTransformStyle = {
  transformOrigin: 'top left',
  transition: 'transform 0.3s',
  willChange: 'transform',
};

function getTimelineStyle(isMixerOpen: boolean, timelineScaleFactor: number) {
  return isMixerOpen
    ? { ...defaultTransformStyle, transform: `scaleY(${timelineScaleFactor})` }
    : defaultTransformStyle;
}

function getRewindButtonStyle(
  isMixerOpen: boolean,
  drawerHeight: number,
  timelineScaleFactor: number,
) {
  const translateAmount =
    drawerHeight - TIMELINE_MARGIN * (1 - timelineScaleFactor);
  return isMixerOpen
    ? {
        ...defaultTransformStyle,
        transform: `translateY(-${translateAmount}px)`,
      }
    : defaultTransformStyle;
}

export default Scrubber;
