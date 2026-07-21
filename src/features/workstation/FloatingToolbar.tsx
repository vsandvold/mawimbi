import { Mic, Pause, Play, SkipBack } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { usePlaybackService } from '../playback/usePlaybackService';
import { useRecordingService } from '../recording/useRecordingService';
import './FloatingToolbar.css';

type FloatingToolbarProps = {
  isEmpty: boolean;
  isRecordingOpen: boolean;
  /** True while counting in or actively recording. Workstation's own
   *  isCountingIn/isRecording state, not the service's isTransportLocked —
   *  that signal only flips after RecordingService.startCountIn() runs
   *  inside useCountIn's async mic-permission effect, so it briefly lags
   *  the local state the moment the drawer's Record control is pressed;
   *  using it here would leave this button (and the drawer's close
   *  control) clickable for that window. */
  isRecordingLocked: boolean;
  onRewind: () => void;
  /** Opens/closes the recording drawer (spec 005 Decision 5) — arming
   *  itself happens from the drawer's own control, not here. */
  onToggleRecording: () => void;
};

const FloatingToolbar = (props: FloatingToolbarProps) => {
  const { isPlaying, togglePlayback } = usePlaybackService();
  const { isTransportLocked, recordingState } = useRecordingService();
  const {
    isEmpty,
    isRecordingOpen,
    isRecordingLocked,
    onRewind,
    onToggleRecording,
  } = props;
  const isRecordActive = recordingState !== 'idle';

  return (
    <div className="floating-toolbar floating-button-group">
      <Button
        variant="ghost"
        size="icon"
        className="button"
        title="Rewind"
        onClick={onRewind}
        disabled={isEmpty || isTransportLocked}
      >
        <SkipBack />
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        className="button floating-toolbar__button--play"
        title={isPlaying ? 'Pause' : 'Play'}
        onClick={togglePlayback}
        disabled={isEmpty || isTransportLocked}
      >
        {isPlaying ? <Pause /> : <Play />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="button"
        title={isRecordingOpen ? 'Hide recording' : 'Show recording'}
        onClick={onToggleRecording}
        disabled={isRecordingLocked}
      >
        {isRecordActive ? <Mic className="text-red-500" /> : <Mic />}
      </Button>
    </div>
  );
};

export default FloatingToolbar;
