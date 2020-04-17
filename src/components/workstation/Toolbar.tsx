import Icon, {
  CaretRightOutlined,
  StepBackwardOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import classNames from 'classnames';
import React from 'react';
import { ReactComponent as ControlSvg } from '../../icons/control.svg';
import { ReactComponent as StopSvg } from '../../icons/stop.svg';
import './Toolbar.css';
import useWorkstationContext from './useWorkstationContext';
import {
  SET_TRANSPORT_TIME,
  STOP_PLAYBACK,
  TOGGLE_DRAWER,
  TOGGLE_PLAYBACK,
} from './useWorkstationState';

type ToolbarProps = {
  isDrawerOpen: boolean;
  isEmpty: boolean;
  isPlaying: boolean;
};

const Toolbar = ({ isDrawerOpen, isEmpty, isPlaying }: ToolbarProps) => {
  console.log('Toolbar render');

  const [dispatch] = useWorkstationContext();

  const stopOrRewindPlayback = () => {
    if (isPlaying) {
      dispatch([STOP_PLAYBACK]);
    } else {
      dispatch([SET_TRANSPORT_TIME, 0]);
    }
  };

  const stopRewindButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={isPlaying ? <Icon component={StopSvg} /> : <StepBackwardOutlined />}
      title={isPlaying ? 'Stop' : 'Rewind'}
      onClick={stopOrRewindPlayback}
      disabled={isEmpty}
    />
  );

  const playPauseButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={<CaretRightOutlined />}
      title={isPlaying ? 'Pause' : 'Play'}
      onClick={() => dispatch([TOGGLE_PLAYBACK])}
      disabled={isEmpty}
    />
  );

  const mixerIconClass = classNames({ 'show-mixer': isDrawerOpen });
  const mixerIcon = (
    <Icon component={ControlSvg} rotate={90} className={mixerIconClass} />
  );

  const mixerButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={mixerIcon}
      title={isDrawerOpen ? 'Hide mixer' : 'Show mixer'}
      onClick={() => dispatch([TOGGLE_DRAWER])}
      disabled={isEmpty}
    />
  );

  return (
    <div className="toolbar">
      <div className="toolbar__button">{stopRewindButton}</div>
      <div className="toolbar__button">{playPauseButton}</div>
      <div className="toolbar__button">{mixerButton}</div>
    </div>
  );
};

export default Toolbar;
