import React from 'react';
import './Timeline.css';
import Waveform from './Waveform';

type TimelineProps = {
  audioBuffers: AudioBuffer[];
  pixelsPerSecond: number;
};

const Timeline = ({ audioBuffers, pixelsPerSecond }: TimelineProps) => {
  console.log('Timeline render');

  return (
    <div className="timeline">
      {audioBuffers.map((buffer) => (
        <div className="timeline_waveform" style={{ opacity: 0.5 }}>
          <Waveform audioBuffer={buffer} pixelsPerSecond={pixelsPerSecond} />
        </div>
      ))}
    </div>
  );
};

export default Timeline;
