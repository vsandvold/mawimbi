import { Mic, Pause, PenLine, Play, SkipBack } from 'lucide-react';
import { Button } from '../ui/button';
import classNames from 'classnames';
import ControlSvg from '../../icons/control.svg?react';
import { usePlaybackService } from '../../hooks/usePlaybackService';
import { useRecordingService } from '../../hooks/useRecordingService';
import './Toolbar.css';

type ToolbarProps = {
  isMixerOpen: boolean;
  isLyricsOpen: boolean;
  isEmpty: boolean;
  onToggleMixer: () => void;
  onToggleLyrics: () => void;
  onToggleRecording: () => void;
};

const Toolbar = (props: ToolbarProps) => {
  const { isPlaying, isStopped, rewind, togglePlayback } = usePlaybackService();
  const { isTransportLocked, recordingState } = useRecordingService();
  const {
    isMixerOpen,
    isLyricsOpen,
    isEmpty,
    onToggleMixer,
    onToggleLyrics,
    onToggleRecording,
  } = props;
  const isRecordActive = recordingState !== 'idle';

  const lyricsIconClass = classNames({ 'show-lyrics': isLyricsOpen });
  const lyricsButton = (
    <Button
      variant="ghost"
      size="icon-lg"
      className="button"
      title={isLyricsOpen ? 'Hide lyrics' : 'Show lyrics'}
      onClick={onToggleLyrics}
      disabled={isEmpty}
    >
      <PenLine className={lyricsIconClass} />
    </Button>
  );

  const mixerIconClass = classNames('custom-icon', {
    'show-mixer': isMixerOpen,
  });
  const mixerIcon = (
    <span className={mixerIconClass}>
      <ControlSvg />
    </span>
  );

  const mixerButton = (
    <Button
      variant="ghost"
      size="icon-lg"
      className="button"
      title={isMixerOpen ? 'Hide mixer' : 'Show mixer'}
      onClick={onToggleMixer}
      disabled={isEmpty}
    >
      {mixerIcon}
    </Button>
  );

  const rewindButton = (
    <Button
      variant="ghost"
      size="icon-lg"
      className="button"
      title="Rewind"
      onClick={rewind}
      disabled={isEmpty || isTransportLocked || isStopped}
    >
      <SkipBack />
    </Button>
  );

  const playPauseButton = (
    <Button
      variant="ghost"
      size="icon-lg"
      className="button"
      title={isPlaying ? 'Pause' : 'Play'}
      onClick={togglePlayback}
      disabled={isEmpty || isTransportLocked}
    >
      {isPlaying ? <Pause /> : <Play />}
    </Button>
  );

  const microphoneButton = (
    <Button
      variant="ghost"
      size="icon-lg"
      className="button"
      title="Record"
      onClick={onToggleRecording}
    >
      {isRecordActive ? <Mic className="text-red-500" /> : <Mic />}
    </Button>
  );

  return (
    <div className="toolbar">
      <div className="toolbar__button">{lyricsButton}</div>
      <div className="toolbar__button">{mixerButton}</div>
      <div className="toolbar__button">{rewindButton}</div>
      <div className="toolbar__button">{playPauseButton}</div>
      <div className="toolbar__button">{microphoneButton}</div>
    </div>
  );
};

export default Toolbar;
