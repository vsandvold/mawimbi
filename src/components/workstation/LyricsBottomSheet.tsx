import { useCallback } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useTrackService } from '../../hooks/useTrackService';
import { useTranscriptionService } from '../../hooks/useTranscriptionService';
import { type Track, type TrackId } from '../../types/track';
import type { TranscriptionSegment } from '../../types/transcription';
import type { TranscriptionState } from '../../services/TranscriptionService';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import BottomSheet from './BottomSheet';
import './LyricsBottomSheet.css';

const VOICE_INSTRUMENT = 'voice';

type LyricsBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onHeightChange: (height: number) => void;
  tracks: Track[];
};

const LyricsBottomSheet = ({
  isOpen,
  onOpenChange,
  onHeightChange,
  tracks,
}: LyricsBottomSheetProps) => {
  const trackService = useTrackService();
  const transcription = useTranscriptionService();
  const vocalTracks = tracks.filter(
    (track) => track.instrument === VOICE_INSTRUMENT,
  );

  const handleTranscribe = useCallback(
    (trackId: TrackId) => {
      const audioBuffer = trackService.retrieveAudioBuffer(trackId);
      if (!audioBuffer) return;
      // Fire-and-forget — state is tracked via signals
      transcription.transcribe(trackId, audioBuffer);
    },
    // trackService and transcription are stable refs from context
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onHeightChange={onHeightChange}
      title="Lyrics"
    >
      {vocalTracks.length === 0 ? (
        <p className="lyrics-bottom-sheet__empty">No vocal tracks detected</p>
      ) : (
        <ul className="lyrics-bottom-sheet__list">
          {vocalTracks.map((track) => (
            <TrackTranscription
              key={track.trackId}
              track={track}
              state={transcription.getTranscriptionState(track.trackId)}
              segments={transcription.getTranscription(track.trackId)?.segments}
              downloadProgress={transcription.downloadProgress}
              onTranscribe={handleTranscribe}
            />
          ))}
        </ul>
      )}
    </BottomSheet>
  );
};

// --- Per-track transcription row ---

type TrackTranscriptionProps = {
  track: Track;
  state: TranscriptionState;
  segments: TranscriptionSegment[] | undefined;
  downloadProgress: number | null;
  onTranscribe: (trackId: TrackId) => void;
};

const TrackTranscription = ({
  track,
  state,
  segments,
  downloadProgress,
  onTranscribe,
}: TrackTranscriptionProps) => {
  const handleClick = useCallback(() => {
    onTranscribe(track.trackId);
  }, [onTranscribe, track.trackId]);

  return (
    <li className="lyrics-bottom-sheet__item">
      <div className="lyrics-bottom-sheet__header">
        <span
          className="lyrics-bottom-sheet__color"
          style={{
            backgroundColor: `rgb(${track.color.r},${track.color.g},${track.color.b})`,
          }}
        />
        <span className="lyrics-bottom-sheet__filename">{track.fileName}</span>
        <TrackAction state={state} onClick={handleClick} />
      </div>
      <TrackContent
        state={state}
        segments={segments}
        downloadProgress={downloadProgress}
      />
    </li>
  );
};

// --- Action button per state ---

type TrackActionProps = {
  state: TranscriptionState;
  onClick: () => void;
};

const TrackAction = ({ state, onClick }: TrackActionProps) => {
  if (state === 'transcribing') {
    return (
      <LoaderCircle
        className="lyrics-bottom-sheet__spinner"
        size={16}
        aria-label="Transcribing"
      />
    );
  }

  if (state === 'error') {
    return (
      <Button variant="outline" size="sm" onClick={onClick}>
        Retry
      </Button>
    );
  }

  if (state === 'done') {
    return null;
  }

  // idle
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      Transcribe
    </Button>
  );
};

// --- Content area per state ---

type TrackContentProps = {
  state: TranscriptionState;
  segments: TranscriptionSegment[] | undefined;
  downloadProgress: number | null;
};

const TrackContent = ({
  state,
  segments,
  downloadProgress,
}: TrackContentProps) => {
  if (state === 'transcribing') {
    const showProgress = downloadProgress !== null;
    return (
      <div className="lyrics-bottom-sheet__status">
        {showProgress ? (
          <>
            <span className="lyrics-bottom-sheet__status-text">
              Downloading model… {Math.round(downloadProgress)}%
            </span>
            <Progress value={downloadProgress} />
          </>
        ) : (
          <span className="lyrics-bottom-sheet__status-text">
            Transcribing…
          </span>
        )}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <p className="lyrics-bottom-sheet__error">
        Transcription failed. Click Retry to try again.
      </p>
    );
  }

  if (state === 'done' && segments) {
    if (segments.length === 0) {
      return (
        <p className="lyrics-bottom-sheet__no-speech">No speech detected</p>
      );
    }
    return (
      <div className="lyrics-bottom-sheet__segments">
        {segments.map((segment, index) => (
          <p key={index} className="lyrics-bottom-sheet__segment">
            {segment.text}
          </p>
        ))}
      </div>
    );
  }

  // idle
  return null;
};

export default LyricsBottomSheet;
