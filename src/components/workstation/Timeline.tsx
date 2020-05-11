import classNames from 'classnames';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Track } from '../project/projectPageReducer';
import Spectrogram from './Spectrogram';
import './Timeline.css';

type TimelineProps = {
  focusedTracks: number[];
  mutedTracks: number[];
  pixelsPerSecond: number;
  tracks: Track[];
};

const Timeline = ({
  focusedTracks,
  mutedTracks,
  pixelsPerSecond,
  tracks,
}: TimelineProps) => {
  const [height, setHeight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (containerRef.current) {
      const { height } = containerRef.current.getBoundingClientRect();
      setHeight(height);
    }
  }, []); // make sure effect only triggers once, on component mount

  return (
    <div ref={containerRef} className="timeline">
      {containerRef.current &&
        tracks.map((track) => {
          const timelineWaveformClass = getTimelineWaveformClass(
            track,
            mutedTracks,
            focusedTracks
          );
          return (
            <div key={track.id} className={timelineWaveformClass}>
              <MemoizedSpectrogram
                height={height}
                pixelsPerSecond={pixelsPerSecond}
                track={track}
              />
            </div>
          );
        })}
    </div>
  );
};

const MemoizedSpectrogram = React.memo(Spectrogram);

function getTimelineWaveformClass(
  track: Track,
  mutedTracks: number[],
  focusedTracks: number[]
) {
  const isMuted = mutedTracks.includes(track.id);
  const isForeground = focusedTracks.includes(track.id);
  const isBackground = focusedTracks.length > 0 && !isForeground;
  return classNames('timeline__waveform', {
    'timeline__waveform--muted': isMuted,
    'timeline__waveform--foreground': !isMuted && isForeground,
    'timeline__waveform--background': !isMuted && isBackground,
  });
}

export default Timeline;
