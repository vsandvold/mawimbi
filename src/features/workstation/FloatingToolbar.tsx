import { Mic, Pause, Play, SkipBack } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { usePlaybackService } from '../playback/usePlaybackService';
import { useRecordingService } from '../recording/useRecordingService';
import './FloatingToolbar.css';

type FloatingToolbarProps = {
  isEmpty: boolean;
  isRecordingOpen: boolean;
  onRewind: () => void;
  /** Opens/closes the recording drawer (spec 005 Decision 5) — arming
   *  itself happens from the drawer's own control, not here. */
  onToggleRecording: () => void;
};

const FloatingToolbar = (props: FloatingToolbarProps) => {
  const { isPlaying, togglePlayback } = usePlaybackService();
  const { isTransportLocked, recordingState } = useRecordingService();
  const { isEmpty, isRecordingOpen, onRewind, onToggleRecording } = props;
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
        disabled={isTransportLocked}
      >
        {isRecordActive ? <Mic className="text-red-500" /> : <Mic />}
      </Button>
    </div>
  );
};

export default FloatingToolbar;
