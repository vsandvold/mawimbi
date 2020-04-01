import React from 'react';
import './Timeline.css';

type TimelineProps = {
  children: JSX.Element[];
};

const Timeline = ({ children }: TimelineProps) => {
  console.log('Timeline render');
  return (
    <div className="timeline">
      {children.map(child => (
        <div className="timeline_waveform" style={{ opacity: 0.5 }}>
          {child}
        </div>
      ))}
    </div>
  );
};

export default Timeline;
