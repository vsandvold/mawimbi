import Icon, {
  AudioFilled,
  AudioOutlined,
  CaretRightOutlined,
  PauseOutlined,
  StepBackwardOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import { useSignals } from '@preact/signals-react/runtime';
import classNames from 'classnames';
import ControlSvg from '../../icons/control.svg?react';
import {
  usePlaybackService,
  useRecordingService,
} from '../../hooks/useAudioService';
import './Toolbar.css';

type ToolbarProps = {
  isMixerOpen: boolean;
  isEmpty: boolean;
  onToggleMixer: () => void;
  onToggleRecording: () => void;
};

const Toolbar = (props: ToolbarProps) => {
  useSignals();
  const playbackService = usePlaybackService();
  const recordingService = useRecordingService();
  const { isMixerOpen, isEmpty, onToggleMixer, onToggleRecording } = props;
  const isPlaying = playbackService.isPlaying.value;
  const locked = recordingService.isTransportLocked();
  const recState = recordingService.recordingState.value;
  const isRecordActive = recState !== 'idle';
  const isStopped = playbackService.playbackState.value === 'stopped';

  const mixerIconClass = classNames({ 'show-mixer': isMixerOpen });
  const mixerIcon = <Icon component={ControlSvg} className={mixerIconClass} />;

  const mixerButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={mixerIcon}
      title={isMixerOpen ? 'Hide mixer' : 'Show mixer'}
      onClick={onToggleMixer}
      disabled={isEmpty}
    />
  );

  const rewindButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={<StepBackwardOutlined />}
      title="Rewind"
      onClick={() => playbackService.rewind()}
      disabled={isEmpty || locked || isStopped}
    />
  );

  const playPauseButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
      title={isPlaying ? 'Pause' : 'Play'}
      onClick={() => playbackService.togglePlayback()}
      disabled={isEmpty || locked}
    />
  );

  const microphoneButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={isRecordActive ? <AudioFilled /> : <AudioOutlined />}
      title="Record"
      onClick={onToggleRecording}
    />
  );

  return (
    <div className="toolbar">
      <div className="toolbar__button">{mixerButton}</div>
      <div className="toolbar__button">{rewindButton}</div>
      <div className="toolbar__button">{playPauseButton}</div>
      <div className="toolbar__button">{microphoneButton}</div>
    </div>
  );
};

export default Toolbar;
