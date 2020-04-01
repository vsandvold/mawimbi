import { CaretRightOutlined, PauseOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import React from 'react';
import './Toolbar.css';

type ToolbarProps = {
  isPlaying: boolean;
  setIsPlaying: (value: React.SetStateAction<boolean>) => void;
};

const Toolbar = (props: ToolbarProps) => {
  return (
    <div className="toolbar">
      <PlayPauseButton {...props} />
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
      onClick={() => setIsPlaying(prevIsPlaying => !prevIsPlaying)}
    />
  );
};

export default Toolbar;
