import {
  CaretRightOutlined,
  ControlOutlined,
  PauseOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import React from 'react';
import './Toolbar.css';
import useWorkstationContext from './useWorkstationContext';
import { TOGGLE_DRAWER, TOGGLE_PLAYING } from './useWorkstationState';

type ToolbarProps = {
  isPlaying: boolean;
  isDrawerOpen: boolean;
};

const Toolbar = ({ isPlaying, isDrawerOpen }: ToolbarProps) => {
  console.log('Toolbar render');

  const [dispatch] = useWorkstationContext();

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
