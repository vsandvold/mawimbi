import Icon, {
  AudioFilled,
  AudioOutlined,
  CaretRightOutlined,
  PauseOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import classNames from 'classnames';
import React from 'react';
import ControlSvg from '../../icons/control.svg?react';
import {
  isPlaying as isPlayingSignal,
  togglePlayback,
} from '../../signals/transportSignals';
import './Toolbar.css';
import useWorkstationDispatch from './useWorkstationDispatch';
import { TOGGLE_MIXER, TOGGLE_RECORDING } from './workstationReducer';

type ToolbarProps = {
  isMixerOpen: boolean;
  isEmpty: boolean;
  isRecording: boolean;
};

const Toolbar = (props: ToolbarProps) => {
  const { isMixerOpen, isEmpty, isRecording } = props;
  const isPlaying = isPlayingSignal.value;
  const dispatch = useWorkstationDispatch();

  const mixerIconClass = classNames({ 'show-mixer': isMixerOpen });
  const mixerIcon = <Icon component={ControlSvg} className={mixerIconClass} />;

  const mixerButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={mixerIcon}
      title={isMixerOpen ? 'Hide mixer' : 'Show mixer'}
      onClick={() => dispatch([TOGGLE_MIXER])}
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
      disabled={isEmpty}
    />
  );

  const microphoneButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={isRecording ? <AudioFilled /> : <AudioOutlined />}
      title="Record"
      onClick={() => dispatch([TOGGLE_RECORDING])}
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
