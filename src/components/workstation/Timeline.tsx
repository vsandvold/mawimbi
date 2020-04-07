import classNames from 'classnames';
import React from 'react';
import { Track } from '../project/useProjectState';
import './Timeline.css';
import Waveform from './Waveform';

type TimelineProps = {
  focusedTracks: number[];
  pixelsPerSecond: number;
  tracks: Track[];
};

const Timeline = ({
  focusedTracks,
  pixelsPerSecond,
  tracks,
}: TimelineProps) => {
  console.log('Timeline render');

  return (
    <div className="timeline">
      {tracks.map((track) => {
        const timelineWaveformClass = classNames('timeline__waveform', {
          'timeline__waveform--focused': focusedTracks.includes(track.id),
        });
        return (
          <div key={track.id} className={timelineWaveformClass}>
            <Waveform track={track} pixelsPerSecond={pixelsPerSecond} />
          </div>
        );
      })}
    </div>
  );
};

export default Timeline;
