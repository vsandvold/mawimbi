import { Headphones, Mic, Square } from 'lucide-react';
import classNames from 'classnames';
import { Button } from '../../shared/ui/button';
import { Slider } from '../../shared/ui/slider';
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
  isMonitoring: boolean;
  monitorVolume: number;
  onToggleMonitoring: () => void;
  onMonitorVolumeChange: (value: number) => void;
};

const RecordingBottomSheet = ({
  isOpen,
  onOpenChange,
  onHeightChange,
  isCountingIn,
  isRecording,
  onToggleRecord,
  isMonitoring,
  monitorVolume,
  onToggleMonitoring,
  onMonitorVolumeChange,
}: RecordingBottomSheetProps) => {
  const isActive = isCountingIn || isRecording;
  const label = isRecording ? 'Stop' : isCountingIn ? 'Cancel' : 'Record';
  const status = isRecording
    ? 'Recording…'
    : isCountingIn
      ? 'Counting in…'
      : 'Ready to record';

  const handleMonitorVolumeChange = (values: number[]) => {
    onMonitorVolumeChange(values[0]);
  };

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
        <div className="recording-bottom-sheet__monitoring">
          <Button
            variant="ghost"
            size="icon"
            className={classNames('recording-bottom-sheet__monitor-toggle', {
              'recording-bottom-sheet__monitor-toggle--active': isMonitoring,
            })}
            title={isMonitoring ? 'Disable monitoring' : 'Enable monitoring'}
            onClick={onToggleMonitoring}
          >
            <Headphones />
          </Button>
          <Slider
            className="recording-bottom-sheet__monitor-slider"
            aria-label="Monitor volume"
            value={[monitorVolume]}
            min={0}
            max={100}
            onValueChange={handleMonitorVolumeChange}
          />
        </div>
      </div>
    </BottomSheet>
  );
};

export default RecordingBottomSheet;
