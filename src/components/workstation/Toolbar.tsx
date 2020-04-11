import {
  CaretRightOutlined,
  ControlOutlined,
  PauseOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import React from 'react';
import './Toolbar.css';
import useWorkstationContext from './useWorkstationContext';
import { TOGGLE_DRAWER, TOGGLE_PLAYBACK } from './useWorkstationState';

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
      size="large"
      style={getButtonStyle(isPlaying)}
      icon={isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
      title={isPlaying ? 'Pause' : 'Play'}
      onClick={() => dispatch([TOGGLE_PLAYBACK])}
    />
  );

  const mixerButton = (
    <Button
      type="link"
      size="large"
      style={getButtonStyle(isDrawerOpen)}
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

function getButtonStyle(isActive = false) {
  const buttonOpacity = isActive ? 1 : 0.65;
  const buttonColor = `rgba(255, 255, 255, ${buttonOpacity})`;
  const boxShadow = isActive ? `0 0 1px 1px ${buttonColor} inset` : 'none';
  return { color: buttonColor, boxShadow, borderRadius: '2px' };
}

export default Toolbar;
