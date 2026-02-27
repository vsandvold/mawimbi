import { useSignals } from '@preact/signals-react/runtime';
import classNames from 'classnames';
import { useContainerHeight } from '../../hooks/useContainerHeight';
import { focusedTracks as focusedTracksSignal } from '../../signals/focusSignals';
import { mutedTracks as mutedTracksSignal } from '../../signals/trackSignals';
import { Track, TrackId } from '../project/projectPageReducer';
import Spectrogram from './Spectrogram';
import './Timeline.css';

type TimelineProps = {
  pixelsPerSecond: number;
  tracks: Track[];
};

const Timeline = ({ pixelsPerSecond, tracks }: TimelineProps) => {
  useSignals();
  const { containerRef, height } = useContainerHeight();

  const focusedTracks = focusedTracksSignal.value;
  const mutedTracks = mutedTracksSignal.value;

  return (
    <div ref={containerRef} className="timeline">
      {height > 0 &&
        tracks.map((track) => {
          const timelineTrackClass = getTimelineTrackClass(
            track,
            mutedTracks,
            focusedTracks,
          );
          return (
            <div key={track.trackId} className={timelineTrackClass}>
              <Spectrogram
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

function getTimelineTrackClass(
  track: Track,
  mutedTracks: TrackId[],
  focusedTracks: TrackId[],
) {
  const isMuted = mutedTracks.includes(track.trackId);
  const isForeground = focusedTracks.includes(track.trackId);
  const isBackground = focusedTracks.length > 0 && !isForeground;
  return classNames('timeline__track', {
    'timeline__track--muted': isMuted,
    'timeline__track--foreground': !isMuted && isForeground,
    'timeline__track--background': !isMuted && isBackground,
  });
}

export default Timeline;
