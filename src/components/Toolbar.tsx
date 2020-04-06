import {
  CaretRightOutlined,
  ControlOutlined,
  PauseOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import React, { useContext } from 'react';
import {
  ProjectDispatch,
  TOGGLE_DRAWER,
  TOGGLE_PLAYING,
} from '../reducers/projectReducer';
import './Toolbar.css';

type ToolbarProps = {
  isPlaying: boolean;
  isDrawerOpen: boolean;
};

const Toolbar = ({ isPlaying, isDrawerOpen }: ToolbarProps) => {
  console.log('Toolbar render');

  const dispatch = useContext(ProjectDispatch);

  const playPauseButton = (
    <Button
      type="link"
      ghost
      size="large"
      icon={isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
      title={isPlaying ? 'Pause' : 'Play'}
      onClick={() => dispatch([TOGGLE_PLAYING])}
    />
  );

  const mixerButton = (
    <Button
      type="link"
      ghost
      size="large"
      icon={<ControlOutlined />}
      title={isDrawerOpen ? 'Hide mixer' : 'Show mixer'}
      onClick={() => dispatch([TOGGLE_DRAWER])}
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
