import {
  CaretRightOutlined,
  ControlOutlined,
  PauseOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import React from 'react';
import './Toolbar.css';

type ToolbarProps = {
  isPlaying: boolean;
  setIsPlaying: (value: React.SetStateAction<boolean>) => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (value: React.SetStateAction<boolean>) => void;
};

const Toolbar = (props: ToolbarProps) => {
  console.log('Toolbar render');

  return (
    <div className="toolbar">
      <div className="toolbar__button">
        <PlayPauseButton {...props} />
      </div>
      <div className="toolbar__button">
        <MixerButton {...props} />
      </div>
    </div>
  );
};

const PlayPauseButton = ({ isPlaying, setIsPlaying }: ToolbarProps) => {
  return (
    <Button
      type="link"
      ghost
      size="large"
      icon={isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
      title={isPlaying ? 'Pause' : 'Play'}
      onClick={() => setIsPlaying((prevIsPlaying) => !prevIsPlaying)}
    />
  );
};

const MixerButton = ({ isDrawerOpen, setIsDrawerOpen }: ToolbarProps) => {
  return (
    <Button
      type="link"
      ghost
      size="large"
      icon={<ControlOutlined />}
      title={isDrawerOpen ? 'Hide mixer' : 'Show mixer'}
      onClick={() => setIsDrawerOpen((prevIsDrawerOpen) => !prevIsDrawerOpen)}
    />
  );
};

export default Toolbar;
