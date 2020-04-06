import React from 'react';
import { Track } from '../project/useProjectState';
import './Timeline.css';
import Waveform from './Waveform';

type TimelineProps = {
  tracks: Track[];
  pixelsPerSecond: number;
};

const Timeline = ({ tracks, pixelsPerSecond }: TimelineProps) => {
  console.log('Timeline render');

  return (
    <div className="timeline">
      {tracks.map((track) => (
        <div key={track.id} className="timeline_waveform">
          <Waveform track={track} pixelsPerSecond={pixelsPerSecond} />
        </div>
      ))}
    </div>
  );
};

export default Timeline;
