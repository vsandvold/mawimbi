import Icon, { CaretRightOutlined, PauseOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import classNames from 'classnames';
import React from 'react';
import { ReactComponent as ControlSvg } from '../../icons/control.svg';
import './Toolbar.css';
import useWorkstationDispatchContext from './useWorkstationDispatchContext';
import { TOGGLE_DRAWER, TOGGLE_PLAYBACK } from './workstationReducer';

type ToolbarProps = {
  isDrawerOpen: boolean;
  isEmpty: boolean;
  isPlaying: boolean;
};

const Toolbar = ({ isDrawerOpen, isEmpty, isPlaying }: ToolbarProps) => {
  console.log('Toolbar render');

  const dispatch = useWorkstationDispatchContext();

  const playPauseButton = (
    <Button
      type="link"
      size="large"
      className="button"
      icon={isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
      title={isPlaying ? 'Pause' : 'Play'}
      onClick={() => dispatch([TOGGLE_PLAYBACK])}
      disabled={isEmpty}
    />
  );

  const mixerIconClass = classNames({ 'show-mixer': isDrawerOpen });
  const mixerIcon = <Icon component={ControlSvg} className={mixerIconClass} />;

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
      <div className="toolbar__button">{playPauseButton}</div>
      <div className="toolbar__button">{mixerButton}</div>
    </div>
  );
};

export default Toolbar;
