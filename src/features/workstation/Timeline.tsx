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
  const { mutedTracks, focusedTracks, dragTargetTrackId } = useTrackService();
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
          dragTargetTrackId,
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
  dragTargetTrackId: TrackId | null,
  activeEditTrackId: TrackId | null,
) {
  // Edit-mode classes replace focus and mute classes entirely (spec 004,
  // Goal 1) — every track stays visible while cycling the active layer.
  // Muting is temporarily bypassed sonically as well (TrackService's edit
  // focus), so a muted track renders dimmed like any other background
  // track rather than hidden.
  if (activeEditTrackId !== null) {
    const isEditActive = track.trackId === activeEditTrackId;
    return classNames('timeline__track', {
      'timeline__track--edit-active': isEditActive,
      'timeline__track--edit-background': !isEditActive,
    });
  }

  const isMuted = mutedTracks.includes(track.trackId);
  const isForeground = focusedTracks.includes(track.trackId);
  // Reorder drag's live "over" target — an intermediate lift between
  // foreground and background so the pending-swap preview reads as
  // moving between tracks, not a single static highlight for the whole
  // drag (the dragged track alone would fully occlude a same-tier swap).
  const isDragTarget = !isForeground && track.trackId === dragTargetTrackId;
  const isBackground =
    focusedTracks.length > 0 && !isForeground && !isDragTarget;
  // Lift wins over mute (foreground, then drag-target): touching or
  // dragging a muted channel reveals its track for the interaction (same
  // principle as edit mode) — otherwise the timeline dims with nothing
  // lifted to explain it.
  return classNames('timeline__track', {
    'timeline__track--muted': isMuted && !isForeground && !isDragTarget,
    'timeline__track--foreground': isForeground,
    'timeline__track--drag-target': isDragTarget,
    'timeline__track--background': !isMuted && isBackground,
  });
}

export default Timeline;
