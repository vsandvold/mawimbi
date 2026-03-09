import { useCallback, useEffect, useRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useClassificationService } from '../../hooks/useClassificationService';
import { usePlaybackService } from '../../hooks/usePlaybackService';
import { useTrackService } from '../../hooks/useTrackService';
import { useTranscriptionService } from '../../hooks/useTranscriptionService';
import { type Track, type TrackId } from '../../types/track';
import type {
  TranscriptionSegment,
  TranscriptionWord,
} from '../../types/transcription';
import type { TranscriptionState } from '../../services/TranscriptionService';
import type { TrackColor } from '../../types/track';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import BottomSheet from './BottomSheet';
import './LyricsBottomSheet.css';

const VOCALS_LABEL = 'vocals';

type LyricsBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onHeightChange: (height: number) => void;
  onSeekTo: (time: number) => void;
  tracks: Track[];
};

const LyricsBottomSheet = ({
  isOpen,
  onOpenChange,
  onHeightChange,
  onSeekTo,
  tracks,
}: LyricsBottomSheetProps) => {
  const classification = useClassificationService();
  const playback = usePlaybackService();
  const trackService = useTrackService();
  const transcription = useTranscriptionService();
  const vocalTracks = tracks.filter(
    (track) =>
      classification.getClassification(track.trackId)?.label === VOCALS_LABEL,
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

  // Load cached transcriptions from IndexedDB when the sheet opens
  useEffect(() => {
    if (!isOpen) return;
    for (const track of vocalTracks) {
      if (transcription.getTranscriptionState(track.trackId) === 'idle') {
        transcription.loadCachedTranscription(track.trackId);
      }
    }
    // Fire once when opened; vocalTracks identity changes on every render
    // but we only need to load on open, not on every track list change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
              transportTime={playback.transportTime}
              onTranscribe={handleTranscribe}
              onSeekTo={onSeekTo}
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
  transportTime: number;
  onTranscribe: (trackId: TrackId) => void;
  onSeekTo: (time: number) => void;
};

const TrackTranscription = ({
  track,
  state,
  segments,
  downloadProgress,
  transportTime,
  onTranscribe,
  onSeekTo,
}: TrackTranscriptionProps) => {
  const handleClick = useCallback(() => {
    onTranscribe(track.trackId);
  }, [onTranscribe, track.trackId]);

  const trackStartTime = track.startTime ?? 0;

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
        transportTime={transportTime}
        trackStartTime={trackStartTime}
        trackColor={track.color}
        onSeekTo={onSeekTo}
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
  transportTime: number;
  trackStartTime: number;
  trackColor: TrackColor;
  onSeekTo: (time: number) => void;
};

const TrackContent = ({
  state,
  segments,
  downloadProgress,
  transportTime,
  trackStartTime,
  trackColor,
  onSeekTo,
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
    const relativeTime = transportTime - trackStartTime;
    return (
      <div className="lyrics-bottom-sheet__segments">
        {segments.map((segment, index) => (
          <SegmentPhrases
            key={index}
            segment={segment}
            relativeTime={relativeTime}
            trackStartTime={trackStartTime}
            trackColor={trackColor}
            onSeekTo={onSeekTo}
          />
        ))}
      </div>
    );
  }

  // idle
  return null;
};

// --- Segment with phrase line breaks ---

// Gap between words (in seconds) that indicates a new phrase
const PHRASE_GAP_THRESHOLD_SECONDS = 0.3;

function groupWordsIntoPhrases(
  words: TranscriptionWord[],
): TranscriptionWord[][] {
  if (words.length === 0) return [];

  const phrases: TranscriptionWord[][] = [];
  let currentPhrase: TranscriptionWord[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;

    if (gap >= PHRASE_GAP_THRESHOLD_SECONDS) {
      phrases.push(currentPhrase);
      currentPhrase = [];
    }

    currentPhrase.push(words[i]);
  }

  if (currentPhrase.length > 0) {
    phrases.push(currentPhrase);
  }

  return phrases;
}

function wordClassName(word: TranscriptionWord, relativeTime: number): string {
  const base = 'lyrics-bottom-sheet__word';
  const isActive = relativeTime >= word.start && relativeTime < word.end;
  const isPlayed = relativeTime > word.start;

  if (isActive) return `${base} ${base}--active`;
  if (isPlayed) return `${base} ${base}--played`;
  return base;
}

type SegmentPhrasesProps = {
  segment: TranscriptionSegment;
  relativeTime: number;
  trackStartTime: number;
  trackColor: TrackColor;
  onSeekTo: (time: number) => void;
};

const SegmentPhrases = ({
  segment,
  relativeTime,
  trackStartTime,
  trackColor,
  onSeekTo,
}: SegmentPhrasesProps) => {
  const activeWordRef = useRef<HTMLSpanElement>(null);

  // Auto-scroll to keep the active word centered in the bottom sheet
  useEffect(() => {
    if (activeWordRef.current?.scrollIntoView) {
      activeWordRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [relativeTime]);

  // Fall back to full text when word-level timestamps are unavailable
  if (segment.words.length === 0) {
    return <p className="lyrics-bottom-sheet__segment">{segment.text}</p>;
  }

  const phrases = groupWordsIntoPhrases(segment.words);

  return (
    <div className="lyrics-bottom-sheet__segment">
      {phrases.map((phrase, phraseIndex) => (
        <p key={phraseIndex} className="lyrics-bottom-sheet__phrase">
          {phrase.map((word, wordIndex) => {
            const isActive =
              relativeTime >= word.start && relativeTime < word.end;
            const style = isActive
              ? {
                  color: `rgb(${trackColor.r},${trackColor.g},${trackColor.b})`,
                }
              : undefined;
            return (
              <span
                key={wordIndex}
                ref={isActive ? activeWordRef : undefined}
                role="button"
                className={wordClassName(word, relativeTime)}
                style={style}
                onClick={() => onSeekTo(trackStartTime + word.start)}
              >
                {wordIndex > 0 ? ' ' : ''}
                {word.text}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
};

export default LyricsBottomSheet;
