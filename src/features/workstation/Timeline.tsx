import classNames from 'classnames';
import { useRecordingService } from '../recording/useRecordingService';
import { useTrackService } from '../tracks/useTrackService';
import { type Track, type TrackColor, type TrackId } from '../tracks/types';
import Spectrogram from '../spectrogram/Spectrogram';
import { useEditMode } from './useEditMode';
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
  const { isRecording } = useRecordingService();
  const { mutedTracks, focusedTracks } = useTrackService();
  const { activeEditTrackId } = useEditMode();

  const recordingTrack: Track = {
    trackId: RECORDING_TRACK_ID,
    color: recordingColor,
    fileName: 'Recording',
    index: tracks.length,
  };

  return (
    <div className="timeline">
      {tracks.map((track) => {
        const timelineTrackClass = getTimelineTrackClass(
          track,
          mutedTracks,
          focusedTracks,
          activeEditTrackId,
        );
        return (
          <div
            key={track.trackId}
            className={timelineTrackClass}
            data-track-id={track.trackId}
          >
            <Spectrogram pixelsPerSecond={pixelsPerSecond} track={track} />
          </div>
        );
      })}
      {isRecording && (
        <div className="timeline__track">
          <Spectrogram
            pixelsPerSecond={pixelsPerSecond}
            track={recordingTrack}
            isRecordingTrack
          />
        </div>
      )}
    </div>
  );
};

function getTimelineTrackClass(
  track: Track,
  mutedTracks: TrackId[],
  focusedTracks: TrackId[],
  activeEditTrackId: TrackId | null,
) {
  const isMuted = mutedTracks.includes(track.trackId);

  // Edit-mode classes replace focus and mute classes entirely (spec 004,
  // Goal 1) — every track stays visible while cycling the active layer;
  // mute governs audio, not visibility, so a muted track renders dimmed
  // like any other background track.
  if (activeEditTrackId !== null) {
    const isEditActive = track.trackId === activeEditTrackId;
    return classNames('timeline__track', {
      'timeline__track--edit-active': isEditActive,
      'timeline__track--edit-background': !isEditActive,
    });
  }

  const isForeground = focusedTracks.includes(track.trackId);
  const isBackground = focusedTracks.length > 0 && !isForeground;
  return classNames('timeline__track', {
    'timeline__track--muted': isMuted,
    'timeline__track--foreground': !isMuted && isForeground,
    'timeline__track--background': !isMuted && isBackground,
  });
}

export default Timeline;
