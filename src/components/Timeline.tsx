import React from 'react';
import './Timeline.css';
import Waveform from './Waveform';
import { Track } from '../reducers/projectReducer';

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
