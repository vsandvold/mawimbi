import Icon, {
  AudioFilled,
  AudioOutlined,
  CaretRightOutlined,
  PauseOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import { useSignals } from '@preact/signals-react/runtime';
import classNames from 'classnames';
import ControlSvg from '../../icons/control.svg?react';
import {
  isPlaying as isPlayingSignal,
  togglePlayback,
} from '../../signals/transportSignals';
import './Toolbar.css';

type ToolbarProps = {
  isMixerOpen: boolean;
  isEmpty: boolean;
  isRecording: boolean;
  onToggleMixer: () => void;
  onToggleRecording: () => void;
};

const Toolbar = (props: ToolbarProps) => {
  useSignals();
  const {
    isMixerOpen,
    isEmpty,
    isRecording,
    onToggleMixer,
    onToggleRecording,
  } = props;
  const isPlaying = isPlayingSignal.value;

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

  const playPauseButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
      title={isPlaying ? 'Pause' : 'Play'}
      onClick={() => togglePlayback()}
      disabled={isEmpty || isRecording}
    />
  );

  const microphoneButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={isRecording ? <AudioFilled /> : <AudioOutlined />}
      title="Record"
      onClick={onToggleRecording}
    />
  );
  return (
    <div className="toolbar">
      <div className="toolbar__button">{mixerButton}</div>
      <div className="toolbar__button">{playPauseButton}</div>
      <div className="toolbar__button">{microphoneButton}</div>
    </div>
  );
};

export default Toolbar;
