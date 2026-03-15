import { Mic, Pause, Play, SkipBack } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { usePlaybackService } from '../playback/usePlaybackService';
import { useRecordingService } from '../recording/useRecordingService';
import './FloatingToolbar.css';

type FloatingToolbarProps = {
  isEmpty: boolean;
  onToggleRecording: () => void;
};

const FloatingToolbar = (props: FloatingToolbarProps) => {
  const { isPlaying, togglePlayback, rewind } = usePlaybackService();
  const { isTransportLocked, recordingState } = useRecordingService();
  const { isEmpty, onToggleRecording } = props;
  const isRecordActive = recordingState !== 'idle';

  return (
    <div className="floating-toolbar floating-button-group">
      <Button
        variant="ghost"
        size="icon"
        className="button"
        title="Rewind"
        onClick={rewind}
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
        title="Record"
        onClick={onToggleRecording}
      >
        {isRecordActive ? <Mic className="text-red-500" /> : <Mic />}
      </Button>
    </div>
  );
};

export default FloatingToolbar;
