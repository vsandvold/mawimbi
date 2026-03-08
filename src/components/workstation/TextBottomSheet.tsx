import { type Track } from '../../types/track';
import { Button } from '../ui/button';
import BottomSheet from './BottomSheet';
import './TextBottomSheet.css';

const VOICE_INSTRUMENT = 'voice';

type TextBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onHeightChange: (height: number) => void;
  tracks: Track[];
};

const TextBottomSheet = ({
  isOpen,
  onOpenChange,
  onHeightChange,
  tracks,
}: TextBottomSheetProps) => {
  const vocalTracks = tracks.filter(
    (track) => track.instrument === VOICE_INSTRUMENT,
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onHeightChange={onHeightChange}
      title="Text"
    >
      {vocalTracks.length === 0 ? (
        <p className="text-bottom-sheet__empty">No vocal tracks detected</p>
      ) : (
        <ul className="text-bottom-sheet__list">
          {vocalTracks.map((track) => (
            <li key={track.trackId} className="text-bottom-sheet__item">
              <span
                className="text-bottom-sheet__color"
                style={{
                  backgroundColor: `rgb(${track.color.r},${track.color.g},${track.color.b})`,
                }}
              />
              <span className="text-bottom-sheet__filename">
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

export default TextBottomSheet;
