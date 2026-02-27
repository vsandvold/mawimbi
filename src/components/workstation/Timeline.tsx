import { useSignals } from '@preact/signals-react/runtime';
import classNames from 'classnames';
import { useContainerHeight } from '../../hooks/useContainerHeight';
import { focusedTracks as focusedTracksSignal } from '../../signals/focusSignals';
import { isRecording as isRecordingSignal } from '../../signals/transportSignals';
import { mutedTracks as mutedTracksSignal } from '../../signals/trackSignals';
import { type Track, type TrackColor, type TrackId } from '../../types/track';
import Spectrogram from './spectrogram/Spectrogram';
import './Timeline.css';

const RECORDING_TRACK_ID = '__recording__';

type TimelineProps = {
  pixelsPerSecond: number;
  recordingColor: TrackColor;
  tracks: Track[];
};

const Timeline = ({
  pixelsPerSecond,
  recordingColor,
  tracks,
}: TimelineProps) => {
  useSignals();
  const { containerRef, height } = useContainerHeight();

  const focusedTracks = focusedTracksSignal.value;
  const mutedTracks = mutedTracksSignal.value;
  const isRecording = isRecordingSignal.value;

  const recordingTrack: Track = {
    trackId: RECORDING_TRACK_ID,
    color: recordingColor,
    fileName: 'Recording',
    index: tracks.length,
  };

  return (
    <div ref={containerRef} className="timeline">
      {height > 0 && (
        <>
          {tracks.map((track) => {
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
          {isRecording && (
            <div className="timeline__track">
              <Spectrogram
                height={height}
                pixelsPerSecond={pixelsPerSecond}
                track={recordingTrack}
                isRecordingTrack
              />
            </div>
          )}
        </>
      )}
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
