import { type Track } from '../../types/track';
import { Button } from '../ui/button';
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
  const vocalTracks = tracks.filter(
    (track) => track.instrument === VOICE_INSTRUMENT,
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
            <li key={track.trackId} className="lyrics-bottom-sheet__item">
              <span
                className="lyrics-bottom-sheet__color"
                style={{
                  backgroundColor: `rgb(${track.color.r},${track.color.g},${track.color.b})`,
                }}
              />
              <span className="lyrics-bottom-sheet__filename">
                {track.fileName}
              </span>
              <Button variant="outline" size="sm" disabled>
                Transcribe
              </Button>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
};

export default LyricsBottomSheet;
