import { Mic, Pause, Play, SkipBack } from 'lucide-react';
import { Button } from '../ui/button';
import { usePlaybackService } from '../../hooks/usePlaybackService';
import { useRecordingService } from '../../hooks/useRecordingService';
import './FloatingToolbar.css';

type FloatingToolbarProps = {
  isEmpty: boolean;
  bottomOffset: number;
  onToggleRecording: () => void;
};

const FloatingToolbar = (props: FloatingToolbarProps) => {
  const { isPlaying, togglePlayback, rewind } = usePlaybackService();
  const { isTransportLocked, recordingState } = useRecordingService();
  const { isEmpty, bottomOffset, onToggleRecording } = props;
  const isRecordActive = recordingState !== 'idle';

  return (
    <div className="floating-toolbar" style={{ bottom: bottomOffset }}>
      <Button
        variant="ghost"
        size="icon"
        className="button floating-toolbar__button"
        title="Rewind"
        onClick={rewind}
        disabled={isEmpty || isTransportLocked}
      >
        <SkipBack />
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        className="button floating-toolbar__button floating-toolbar__button--play"
        title={isPlaying ? 'Pause' : 'Play'}
        onClick={togglePlayback}
        disabled={isEmpty || isTransportLocked}
      >
        {isPlaying ? <Pause /> : <Play />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="button floating-toolbar__button"
        title="Record"
        onClick={onToggleRecording}
      >
        {isRecordActive ? <Mic className="text-red-500" /> : <Mic />}
      </Button>
    </div>
  );
};

export default FloatingToolbar;
