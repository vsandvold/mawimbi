import { Mic, Square } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import BottomSheet from './BottomSheet';
import MicLevelMeter from './MicLevelMeter';
import './RecordingBottomSheet.css';

type RecordingBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onHeightChange: (height: number) => void;
  isCountingIn: boolean;
  isRecording: boolean;
  onToggleRecord: () => void;
};

const RecordingBottomSheet = ({
  isOpen,
  onOpenChange,
  onHeightChange,
  isCountingIn,
  isRecording,
  onToggleRecord,
}: RecordingBottomSheetProps) => {
  const isActive = isCountingIn || isRecording;
  const label = isRecording ? 'Stop' : isCountingIn ? 'Cancel' : 'Record';
  const status = isRecording
    ? 'Recording…'
    : isCountingIn
      ? 'Counting in…'
      : 'Ready to record';

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onHeightChange={onHeightChange}
      title="Recording"
      showClose={!isActive}
    >
      <div className="recording-bottom-sheet">
        <MicLevelMeter active={isActive} />
        <Button
          variant={isActive ? 'destructive' : 'default'}
          size="icon-lg"
          className="recording-bottom-sheet__record"
          title={label}
          onClick={onToggleRecord}
        >
          {isActive ? <Square /> : <Mic />}
        </Button>
        <p className="recording-bottom-sheet__status">{status}</p>
      </div>
    </BottomSheet>
  );
};

export default RecordingBottomSheet;
