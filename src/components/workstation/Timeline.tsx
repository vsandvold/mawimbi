import classNames from 'classnames';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { useBrowserSupport } from '../../browserSupport';
import { focusedTracks as focusedTracksSignal } from '../../signals/focusSignals';
import { mutedTracks as mutedTracksSignal } from '../../signals/trackSignals';
import { Track, TrackId } from '../project/projectPageReducer';
import Spectrogram from './Spectrogram';
import './Timeline.css';
import Waveform from './Waveform';

type TimelineProps = {
  pixelsPerSecond: number;
  tracks: Track[];
};

const Timeline = ({ pixelsPerSecond, tracks }: TimelineProps) => {
  const [height, setHeight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (containerRef.current) {
      const { height } = containerRef.current.getBoundingClientRect();
      setHeight(height);
    }
  }, []); // make sure effect only triggers once, on component mount

  const browserSupport = useBrowserSupport();
  const focusedTracks = focusedTracksSignal.value;
  const mutedTracks = mutedTracksSignal.value;

  return (
    <div ref={containerRef} className="timeline">
      {containerRef.current &&
        tracks.map((track) => {
          const timelineWaveformClass = getTimelineWaveformClass(
            track,
            mutedTracks,
            focusedTracks,
          );
          return (
            <div key={track.trackId} className={timelineWaveformClass}>
              {browserSupport.webkitOfflineAudioContext ? (
                <MemoizedWaveform
                  height={height}
                  pixelsPerSecond={pixelsPerSecond}
                  track={track}
                />
              ) : (
                <MemoizedSpectrogram
                  height={height}
                  pixelsPerSecond={pixelsPerSecond}
                  track={track}
                />
              )}
            </div>
          );
        })}
    </div>
  );
};

const MemoizedSpectrogram = React.memo(Spectrogram);
const MemoizedWaveform = React.memo(Waveform);

function getTimelineWaveformClass(
  track: Track,
  mutedTracks: TrackId[],
  focusedTracks: TrackId[],
) {
  const isMuted = mutedTracks.includes(track.trackId);
  const isForeground = focusedTracks.includes(track.trackId);
  const isBackground = focusedTracks.length > 0 && !isForeground;
  return classNames('timeline__waveform', {
    'timeline__waveform--muted': isMuted,
    'timeline__waveform--foreground': !isMuted && isForeground,
    'timeline__waveform--background': !isMuted && isBackground,
  });
}

export default Timeline;
