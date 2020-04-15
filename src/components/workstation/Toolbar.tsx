import Icon, {
  CaretRightOutlined,
  ControlOutlined,
  StepBackwardOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import classNames from 'classnames';
import React from 'react';
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

  const playPauseButtonClass = classNames('button', {
    'button--active': isPlaying,
  });

  const playPauseButton = (
    <Button
      type="link"
      size="large"
      className={playPauseButtonClass}
      icon={<CaretRightOutlined />}
      title={isPlaying ? 'Pause' : 'Play'}
      onClick={() => dispatch([TOGGLE_PLAYBACK])}
      disabled={isEmpty}
    />
  );

  const mixerButtonClass = classNames('button', {
    'button--active': isDrawerOpen,
  });

  const mixerButton = (
    <Button
      type="link"
      size="large"
      className={mixerButtonClass}
      icon={<ControlOutlined />}
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
